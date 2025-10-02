# BillBuddy: Energy Consumption Estimator

**BillBuddy** is a full-stack web application designed to help users track, estimate, and analyze their household or office energy consumption. By logging appliance usage, users can instantly calculate daily and monthly energy costs, promoting informed decisions for energy conservation.

The application features a secure, role-based system for both administrators and customers, offering advanced analytics, real-time cost breakdown, and detailed PDF reporting.

-----

## 🚀 Features

  * **Role-Based Access:** Separate, secure dashboards for **Admin** (customer management) and **Customer** (usage tracking and reporting).
  * **Comprehensive Appliance Catalog:** Tracks consumption for **50+ predefined household and office appliances** with typical wattage values.
  * **Real-Time Cost Calculation:** Instantly calculates daily and monthly energy consumption (kWh) and cost (₹) based on user input, using a fixed rate of **₹8.00/kWh**.
  * **Usage Management:** Customers can easily **Add, Edit, and Delete** their appliance usage entries.
  * **Advanced Analytics:** Dynamic charts (**Chart.js**) provide cost **breakdowns** by appliance and **time-series** analysis for daily/monthly/yearly consumption trends.
  * **Detailed Reporting:** Ability to generate and download comprehensive consumption reports as a **PDF** (powered by `jsPDF`).
  * **Customer Management:** The Admin dashboard allows for full CRUD (Create, Read, Update, Delete) operations on customer accounts.

-----

## 🛠️ Technologies Used

### Backend

  * **Python (Flask):** The micro-framework handling all API routes and business logic (`energy_app.py`).
  * **SQLite3:** Lightweight, file-based database used for storing customer, application, and usage data (`energy_estimator.db`).
  * **`flask-cors`:** For enabling cross-origin requests from the frontend.

### Frontend

  * **HTML5** / **JavaScript (ES6):** Core structure and client-side logic (`app.html`, `app.js`).
  * **Tailwind CSS:** Utility-first CSS framework for a responsive and modern UI (`app.css`).
  * **Chart.js:** Used for rendering all data visualizations (Dashboards and Reports).
  * **jsPDF:** Used to generate and download the PDF usage reports.

-----

## ⚙️ Setup and Installation

Follow these steps to get the BillBuddy API and frontend running locally.

### Prerequisites

  * Python 3.x
  * A modern web browser (for the frontend)

### 1\. Backend Setup

The backend is built with Python and Flask.

1.  **Install Python Dependencies:**
    ```bash
    pip install flask flask-cors
    ```
2.  **Run the Flask Server:**
    ```bash
    python energy_app.py
    ```
    The server will start on `http://127.0.0.1:5000`. Running the script for the first time will automatically:
      * Create the `energy_estimator.db` SQLite database file.
      * Create all necessary database tables (`customer`, `application`, `customer_application`).
      * Populate the `application` table with the 50+ initial appliance entries.

### 2\. Frontend Access

The frontend is a static HTML/CSS/JS application that communicates with the running Flask API.

1.  **Open the Application:**
    Open the `app.html` file in your web browser.
    *(The frontend is configured in `app.js` to connect to the backend running at `http://127.0.0.1:5000`.)*

-----

## 🔑 Usage and Demo

### Admin Login

The application includes a hardcoded admin user for managing customer accounts.

| Role | Email ID | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@billbuddy.com` | *Any password* |

1.  Log in as **Admin**.
2.  Use the **Customer Management** section to add new customers (Note: The customer's email ID is used for their login).

### Customer Login

1.  Log in with the **Email ID** of a customer account created by the Admin.
2.  Navigate to the **Usage Entry** section to record appliance details (Appliance Name, Quantity, Hours/Day).
3.  Check the **Dashboard** and **Reports** views to analyze consumption and cost.
