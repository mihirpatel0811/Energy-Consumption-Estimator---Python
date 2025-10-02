import os
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import sqlite3
import json
from datetime import datetime
from app_database import DB_NAME, get_db_connection, create_tables, insert_initial_applications

# --- Configuration ---
app = Flask(__name__)
CORS(app) # Enable CORS for frontend communication
app.config['SECRET_KEY'] = 'a_very_secret_key_for_session_management'
# UPDATED: Cost is now in INR as per project details
COST_PER_KWH = 8.0 # ?8.00 per kilowatt-hour

# Ensure database is initialized on startup
try:
    create_tables()
    insert_initial_applications()
except Exception as e:
    print(f"Initial DB setup failed: {e}")

# --- Database Connection Management ---
def get_db():
    """Get a database connection, reusing existing one if possible."""
    if 'db' not in g:
        g.db = get_db_connection()
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    """Close the database connection at the end of the request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()

# --- Utility Functions ---

def calculate_daily_cost(watts, hours_day, qty):
    """Calculates Daily kWh and Daily Cost."""
    try:
        # Daily kWh = (Watts * Hours/Day * QTY) / 1000
        daily_kwh = (watts * hours_day * qty) / 1000.0
        # Daily Cost = Daily kWh * Cost per kWh
        daily_cost = daily_kwh * COST_PER_KWH
        return round(daily_kwh, 3), round(daily_cost, 2)
    except Exception:
        return 0.0, 0.0

def get_admin_user():
    """Returns a fixed admin user for authentication."""
    # Fixed credentials for admin as per project requirement (Admin/admin17193)
    return {"id": 1, "username": "admin", "password": "admin17193", "role": "admin"}

def get_customer_user(email_id, password):
    """
    Simulates customer login.
    Uses the customer's email ID/name to retrieve the account.
    A fixed password 'customerpassword' is used for this simulation.
    """
    db = get_db()
    cursor = db.cursor()
    # Using a fixed password 'customerpassword' for all customers (or any password if email matches)
    # The frontend prompt suggests password is ignored for customer, but checking a fixed value is safer simulation
    # We will rely only on email match for simplicity as stated in the frontend note.
    cursor.execute("SELECT customer_id, customer_name, email_id FROM customer WHERE email_id = ?", (email_id,))
    customer = cursor.fetchone()
    if customer:
        return {"id": customer['customer_id'], "name": customer['customer_name'], "role": "customer"}
    return None

def fetch_all_customers():
    """Retrieves all customers for admin view."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT customer_id, customer_name, email_id, phone_no FROM customer ORDER BY customer_id ASC")
    customers = [dict(row) for row in cursor.fetchall()]
    return customers

# --- Authentication Routes ---

@app.route('/api/login', methods=['POST'])
def login():
    """Handles user login for both admin and customers."""
    data = request.json
    username = data.get('username')
    password = data.get('password')

    # Determine role based on username/email pattern or simply check both
    user = None
    admin = get_admin_user()

    # Admin Login Check
    if username == admin['username'] and password == admin['password']:
        user = {"id": admin['id'], "name": admin['username'], "role": "admin"}
    # Customer Login Check
    elif '@' in username: # Assume email for customer login
        # Pass a placeholder password for customer simulation
        user = get_customer_user(username, 'customerpassword')

    if user:
        return jsonify({'success': True, 'user': user}), 200
    else:
        return jsonify({'success': False, 'message': 'Invalid credentials or role.'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    """Handles user logout."""
    return jsonify({'success': True, 'message': 'Logged out successfully.'}), 200

# --- Application Library Route (Used by both Admin and Customer to populate Add App Modal) ---

@app.route('/api/applications', methods=['GET'])
def get_applications():
    """Fetches the list of all available applications (the 50 pre-saved ones)."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT application_name, watts FROM application ORDER BY application_name ASC")
    applications = [dict(row) for row in cursor.fetchall()]
    return jsonify({'success': True, 'applications': applications}), 200


# --- Customer Management Routes (Admin only) ---

@app.route('/api/admin/customers', methods=['GET'])
def get_customers():
    """Admin route to fetch all customer data."""
    try:
        customers = fetch_all_customers()
        return jsonify({'success': True, 'customers': customers}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/admin/customer', methods=['POST'])
def add_customer():
    """Admin route to add a new customer."""
    data = request.json
    name = data.get('name')
    email = data.get('email')
    phone = data.get('phone')
    if not name or not email:
        return jsonify({'success': False, 'message': 'Name and Email are required.'}), 400

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            'INSERT INTO customer (customer_name, email_id, phone_no) VALUES (?, ?, ?)',
            (name, email, phone)
        )
        db.commit()
        return jsonify({'success': True, 'message': 'Customer added successfully.'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'Email address already exists.'}), 409
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/admin/customer/<int:customer_id>', methods=['PUT'])
def edit_customer(customer_id):
    """Admin route to edit an existing customer."""
    data = request.json
    name = data.get('name')
    email = data.get('email')
    phone = data.get('phone')
    if not name or not email:
        return jsonify({'success': False, 'message': 'Name and Email are required.'}), 400

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute(
            'UPDATE customer SET customer_name = ?, email_id = ?, phone_no = ? WHERE customer_id = ?',
            (name, email, phone, customer_id)
        )
        db.commit()
        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': 'Customer not found.'}), 404
        return jsonify({'success': True, 'message': f'Customer {name} updated successfully.'}), 200
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'Email address already exists.'}), 409
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/admin/customer/<int:customer_id>', methods=['DELETE'])
def delete_customer(customer_id):
    """Admin route to delete a customer and all their usage records."""
    db = get_db()
    cursor = db.cursor()
    try:
        # Delete related application usage first
        cursor.execute('DELETE FROM customer_application WHERE customer_id = ?', (customer_id,))
        # Then delete the customer
        cursor.execute('DELETE FROM customer WHERE customer_id = ?', (customer_id,))
        db.commit()

        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': 'Customer not found.'}), 404

        return jsonify({'success': True, 'message': 'Customer and all associated data deleted successfully.'}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# --- Application Usage Routes (Used by Admin on behalf of Customer & by Customer directly) ---

@app.route('/api/customer/<int:customer_id>/applications', methods=['GET'])
def get_customer_applications(customer_id):
    """Fetches all application usage records for a specific customer."""
    db = get_db()
    cursor = db.cursor()
    # Select all fields and format date nicely
    cursor.execute('''
        SELECT 
            cust_app_id, application_name, qty, 
            STRFTIME('%Y-%m-%d %H:%M', date_time) AS date_time,
            watts, hours_day, daily_kwh, daily_cost
        FROM customer_application 
        WHERE customer_id = ?
        ORDER BY date_time DESC
    ''', (customer_id,))
    applications = [dict(row) for row in cursor.fetchall()]
    return jsonify({'success': True, 'applications': applications}), 200

@app.route('/api/customer/<int:customer_id>/application', methods=['POST'])
def add_customer_application(customer_id):
    """Adds a new application usage record for a customer."""
    data = request.json
    app_name = data.get('application_name')
    qty = data.get('qty', 1)
    date_time_str = data.get('date_time')
    watts = data.get('watts')
    hours_day = data.get('hours_day')

    if not all([app_name, date_time_str, watts, hours_day]):
        return jsonify({'success': False, 'message': 'Missing required fields.'}), 400

    try:
        qty = int(qty)
        watts = int(watts)
        hours_day = float(hours_day)
        daily_kwh, daily_cost = calculate_daily_cost(watts, hours_day, qty)

        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            '''INSERT INTO customer_application 
               (customer_id, application_name, qty, date_time, watts, hours_day, daily_kwh, daily_cost) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (customer_id, app_name, qty, date_time_str, watts, hours_day, daily_kwh, daily_cost)
        )
        db.commit()
        return jsonify({'success': True, 'message': 'Application usage added successfully.'}), 201
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid data type for QTY, Watts, or Hours/Day.'}), 400
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/customer/application/<int:cust_app_id>', methods=['PUT'])
def edit_customer_application(cust_app_id):
    """Updates an existing application usage record."""
    data = request.json
    # Only QTY, date_time, and hours_day are expected to be editable in the UI
    qty = data.get('qty')
    date_time_str = data.get('date_time')
    hours_day = data.get('hours_day')

    if not all([qty, date_time_str, hours_day]):
        return jsonify({'success': False, 'message': 'Missing required fields.'}), 400

    db = get_db()
    cursor = db.cursor()

    try:
        # First, retrieve the current record to get the fixed application_name and watts
        cursor.execute("SELECT application_name, watts FROM customer_application WHERE cust_app_id = ?", (cust_app_id,))
        record = cursor.fetchone()
        if not record:
            return jsonify({'success': False, 'message': 'Usage record not found.'}), 404

        app_name = record['application_name']
        watts = record['watts']

        # Calculate new daily kwh and cost
        qty = int(qty)
        hours_day = float(hours_day)
        daily_kwh, daily_cost = calculate_daily_cost(watts, hours_day, qty)

        # Update the record
        cursor.execute(
            '''UPDATE customer_application 
               SET qty = ?, date_time = ?, hours_day = ?, daily_kwh = ?, daily_cost = ? 
               WHERE cust_app_id = ?''',
            (qty, date_time_str, hours_day, daily_kwh, daily_cost, cust_app_id)
        )
        db.commit()

        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': 'Usage record not found after update attempt.'}), 404

        return jsonify({'success': True, 'message': f'Usage record for {app_name} updated successfully.'}), 200
    except ValueError:
        return jsonify({'success': False, 'message': 'Invalid data type for QTY or Hours/Day.'}), 400
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/customer/application/<int:cust_app_id>', methods=['DELETE'])
def delete_customer_application(cust_app_id):
    """Deletes an application usage record."""
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute('DELETE FROM customer_application WHERE cust_app_id = ?', (cust_app_id,))
        db.commit()

        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': 'Usage record not found.'}), 404

        return jsonify({'success': True, 'message': 'Usage record deleted successfully.'}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# --- Reporting and Analysis Routes (Charts, Summary, PDF Data) ---

@app.route('/api/cost_analysis', methods=['GET'])
def get_cost_analysis():
    """
    Provides aggregated data for charts and summary reports based on customer, period, and date filter.
    Filters: customer_id (required), period (day/month/year), date (YYYY-MM-DD, YYYY-MM, or YYYY)
    """
    customer_id = request.args.get('customer_id', type=int)
    period = request.args.get('period', 'month') # Default to month
    date_param = request.args.get('date') # YYYY-MM-DD, YYYY-MM, YYYY

    if not customer_id:
        return jsonify({'success': False, 'message': 'Customer ID is required.'}), 400

    db = get_db()
    cursor = db.cursor()

    try:
        # 1. Base Query Filter Construction
        filter_clause = "WHERE customer_id = ?"
        params = [customer_id]

        # Determine the date filtering based on the provided date_param and period
        # If a specific date is provided, restrict the filter
        if date_param:
            if period == 'day':
                # Filter by YYYY-MM-DD
                filter_clause += " AND date_time LIKE ?"
                params.append(f"{date_param}%")
            elif period == 'month':
                # Filter by YYYY-MM
                filter_clause += " AND date_time LIKE ?"
                params.append(f"{date_param}%")
            elif period == 'year':
                # Filter by YYYY
                filter_clause += " AND date_time LIKE ?"
                params.append(f"{date_param}%")

        # Fallback filter for month/year period when no date_param is explicitly set
        if not date_param:
             if period == 'month':
                # Default to current month if no date is given for month view
                current_month = datetime.now().strftime('%Y-%m')
                filter_clause += " AND date_time LIKE ?"
                params.append(f"{current_month}%")
             elif period == 'year':
                # Default to current year if no date is given for year view
                current_year = datetime.now().strftime('%Y')
                filter_clause += " AND date_time LIKE ?"
                params.append(f"{current_year}%")

        # 2. Summary (Total Cost) Calculation for the selected filter
        cursor.execute(f"SELECT SUM(daily_cost) AS total_cost FROM customer_application {filter_clause}", tuple(params))
        summary_cost = cursor.fetchone()['total_cost'] or 0.0

        # 3. Chart Data Aggregation (Two main types: Application Breakdown and Time Series)

        # Application Breakdown (Pie/Bar Chart): Total cost aggregated by application name for the filtered period
        cursor.execute(f"""
            SELECT application_name, SUM(daily_cost) AS total_cost
            FROM customer_application
            {filter_clause}
            GROUP BY application_name
            ORDER BY total_cost DESC
        """, tuple(params))
        app_breakdown_data = [dict(row) for row in cursor.fetchall()]

        # Time Series Data: Aggregated by time unit (Day, Month, or Year)

        monthly_chart_data_raw = None
        daily_chart_data_raw = None

        if period == 'year':
            # Monthly totals within the selected year
            month_group = "STRFTIME('%Y-%m', date_time)"
            cursor.execute(f"""
                SELECT {month_group} AS month_label, SUM(daily_cost) AS total_cost
                FROM customer_application
                {filter_clause}
                GROUP BY month_label
                ORDER BY month_label ASC
            """, tuple(params))
            monthly_chart_data_raw = [dict(row) for row in cursor.fetchall()]

        elif period == 'month':
            # Daily totals within the selected month
            day_group = "STRFTIME('%Y-%m-%d', date_time)"
            cursor.execute(f"""
                SELECT {day_group} AS day_label, SUM(daily_cost) AS total_cost
                FROM customer_application
                {filter_clause}
                GROUP BY day_label
                ORDER BY day_label ASC
            """, tuple(params))
            daily_chart_data_raw = [dict(row) for row in cursor.fetchall()]


        # 4. Available Filters for UI Controls

        # Available Years
        cursor.execute('''SELECT DISTINCT SUBSTR(date_time, 1, 4) AS year FROM customer_application ORDER BY year DESC''')
        available_years = [row['year'] for row in cursor.fetchall()]

        # Available Months for the selected year
        year_filter = date_param[:4] if date_param and len(date_param) >= 4 else datetime.now().strftime('%Y')
        cursor.execute('''SELECT DISTINCT SUBSTR(date_time, 1, 7) AS month FROM customer_application WHERE date_time LIKE ? ORDER BY month DESC''', (f"{year_filter}%",))
        available_months = [row['month'] for row in cursor.fetchall()]

        response = {
            'success': True,
            'summary_cost': round(summary_cost, 2),
            'app_breakdown_data': app_breakdown_data,
            'monthly_chart_data': monthly_chart_data_raw, # Totals per month (if period=year)
            'daily_chart_data': daily_chart_data_raw, # Totals per day (if period=month or day)
            'available_years': available_years,
            'available_months': available_months,
            'current_filter': {'period': period, 'date': date_param}
        }
        return jsonify(response), 200

    except Exception as e:
        print(f"Error in cost analysis: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/customer/<int:customer_id>/report_data', methods=['GET'])
def get_pdf_report_data(customer_id):
    """Fetches all customer usage data for the PDF export."""
    db = get_db()
    cursor = db.cursor()

    # Get customer details
    cursor.execute("SELECT customer_name, email_id, phone_no FROM customer WHERE customer_id = ?", (customer_id,))
    customer_info = dict(cursor.fetchone())

    # Get all usage data
    cursor.execute(f'''
        SELECT application_name, qty, STRFTIME('%Y-%m-%d %H:%M', date_time) AS date_time, 
               watts, hours_day, daily_kwh, daily_cost
        FROM customer_application 
        WHERE customer_id = ?
        ORDER BY date_time DESC
    ''', (customer_id,))
    usage_data = [dict(row) for row in cursor.fetchall()]

    # Get total cost and consumption
    cursor.execute("SELECT SUM(daily_kwh) AS total_kwh, SUM(daily_cost) AS total_cost FROM customer_application WHERE customer_id = ?", (customer_id,))
    totals = dict(cursor.fetchone())

    return jsonify({
        'success': True,
        'customer_info': customer_info,
        'usage_data': usage_data,
        'totals': totals
    }), 200

# --- Default Route ---

@app.route('/', methods=['GET'])
def index():
    """A simple index route to confirm the API is running."""
    return jsonify({'message': 'BillBuddy Energy Estimator API is running.'}), 200

if __name__ == '__main__':
    # When running locally, ensure the DB and initial data are set up
    if not os.path.exists(DB_NAME):
        create_tables()
        insert_initial_applications()
    app.run(debug=True)