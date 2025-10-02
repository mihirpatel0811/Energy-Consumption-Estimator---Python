import sqlite3
import os
from initial_data import APPLICATIONS_LIST

# Define the path for the SQLite database file
DB_NAME = 'energy_estimator.db'

def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  # Allows accessing columns by name
    return conn

def create_tables():
    """Creates the customer, application, and customer_application tables."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # (i) customer table: Stores user/customer accounts
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customer (
            customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            email_id TEXT UNIQUE NOT NULL,
            phone_no TEXT
        )
    ''')

    # (ii) application table: Stores the 50 predefined apps and their watts
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS application (
            application_name TEXT PRIMARY KEY NOT NULL,
            watts INTEGER NOT NULL
        )
    ''')

    # (iii) customer_application table: Stores a customer's usage entries
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customer_application (
            cust_app_id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            application_name TEXT NOT NULL,
            qty INTEGER NOT NULL,
            date_time TEXT NOT NULL,
            watts INTEGER NOT NULL,
            hours_day REAL NOT NULL,
            daily_kwh REAL,
            daily_cost REAL,
            FOREIGN KEY (customer_id) REFERENCES customer (customer_id),
            FOREIGN KEY (application_name) REFERENCES application (application_name)
        )
    ''')
    conn.commit()
    conn.close()
    print("Database tables created successfully.")

def insert_initial_applications():
    """Populates the application table with 50 predefined applications."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if data already exists to prevent duplication
    cursor.execute("SELECT COUNT(*) FROM application")
    if cursor.fetchone()[0] == 0:
        app_data = [(name, watts) for name, watts in APPLICATIONS_LIST.items()]
        cursor.executemany(
            'INSERT INTO application (application_name, watts) VALUES (?, ?)',
            app_data
        )
        conn.commit()
        print(f"Successfully inserted {len(app_data)} initial applications.")
    else:
        print("Initial application data already exists.")

    conn.close()

if __name__ == '__main__':
    # Ensure the database is initialized when the file is run directly
    if not os.path.exists(DB_NAME):
        create_tables()
        insert_initial_applications()
    else:
        # If DB exists, just ensure tables are up-to-date and initial data is present
        create_tables()
        insert_initial_applications()