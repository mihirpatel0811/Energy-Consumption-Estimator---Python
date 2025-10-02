/**
 * Global State Management
 */
const API_BASE_URL = 'http://127.0.0.1:5000';
const COST_PER_KWH = 8.0; // ₹8.00 per kilowatt-hour (Hardcoded to match backend for client-side display)

let userState = {
    isLoggedIn: false,
    role: null, // 'admin' or 'customer'
    id: null,
    name: null,
    selectedCustomerId: null, // The customer ID currently being viewed (admin) or the user's own ID (customer)
    allApplications: [], // Stores the 50 predefined apps
    allCustomers: [], // Stores list of all customers (for admin)

    // Chart instances for Dashboard
    appChartInstance: null,
    timeChartInstance: null,

    // Chart instances for Reports View
    reportAppChartInstance: null,
    reportTimeChartInstance: null,

    // Analysis State
    costAnalysis: {
        period: 'month', // 'day', 'month', 'year', 'custom'
        selectedDate: new Date().toISOString().substring(0, 7), // YYYY-MM or YYYY-MM-DD
        endDate: null, // For custom range
        summaryCost: 0.00,
        appBreakdownData: [],
        timeSeriesData: [], // Stores either daily or monthly totals
        availableYears: [],
        availableMonths: [],
    }
};

/**
 * --- SESSION TIMEOUT LOGIC ---
 */
let activityTimer;
const SESSION_TIMEOUT = 600000; // 10 minutes

function resetActivityTimer() {
    clearTimeout(activityTimer);
    if (userState.isLoggedIn) {
        activityTimer = setTimeout(handleAutoLogout, SESSION_TIMEOUT);
    }
}

function handleAutoLogout() {
    if (userState.isLoggedIn) {
        clearTimeout(activityTimer);
        showPopup('Session expired due to 10 minutes of inactivity. Please log in again.', 'error');
        logout();
    }
}

function initializeActivityListeners() {
    const activityEvents = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(event => document.removeEventListener(event, resetActivityTimer));
    activityEvents.forEach(event => document.addEventListener(event, resetActivityTimer));
}

/**
 * --- UTILITY FUNCTIONS ---
 */
function showPopup(message, type = 'info') {
    const container = document.getElementById('error-container');
    const id = `popup-${Date.now()}`;
    const color = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500';
    const popupHtml = `
        <div id="${id}" class="error-popup px-6 py-3 rounded-lg text-white shadow-xl ${color} transition duration-500 transform opacity-0 translate-y-2">
            ${message}
        </div>
    `;
    container.insertAdjacentHTML('afterbegin', popupHtml);
    const popupElement = document.getElementById(id);

    // Manually control animation steps for smooth entry/exit
    setTimeout(() => {
        popupElement.classList.remove('opacity-0', 'translate-y-2');
        popupElement.classList.add('opacity-100', 'translate-y-0');
    }, 10);

    setTimeout(() => {
        popupElement.classList.remove('opacity-100', 'translate-y-0');
        popupElement.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => popupElement.remove(), 500);
    }, 4000); // 4 seconds total display
}

async function apiFetch(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const result = await response.json();
        return { ok: response.ok, status: response.status, data: result };
    } catch (error) {
        showPopup(`Network error: ${error.message}`, 'error');
        return { ok: false, status: 500, data: { success: false, message: 'Network error or server unavailable.' } };
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}


/**
 * --- AUTHENTICATION AND NAVIGATION ---
 */

async function login(event) {
    event.preventDefault();
    const form = event.target;
    const username = form.username.value;
    const password = form.password.value;

    const result = await apiFetch('/api/login', 'POST', { username, password });

    if (result.ok && result.data.success) {
        const user = result.data.user;
        userState.isLoggedIn = true;
        userState.role = user.role;
        userState.id = user.id;
        userState.name = user.name;
        userState.allApplications = await fetchAllApplications(); // Fetch all 50 apps once

        // Populate Add/Edit app forms with applications
        populateApplicationSelect();

        resetActivityTimer();
        showPopup(`Welcome, ${user.name}!`, 'success');
        updateUIVisibility();
    } else {
        showPopup(result.data.message || 'Login failed. Check Admin/Customer credentials.', 'error');
    }
}

function logout() {
    clearTimeout(activityTimer);
    userState.isLoggedIn = false;
    userState.role = null;
    userState.id = null;
    userState.name = null;
    userState.selectedCustomerId = null;
    userState.allCustomers = [];

    // Destroy all chart instances
    if (userState.appChartInstance) userState.appChartInstance.destroy();
    if (userState.timeChartInstance) userState.timeChartInstance.destroy();
    if (userState.reportAppChartInstance) userState.reportAppChartInstance.destroy();
    if (userState.reportTimeChartInstance) userState.reportTimeChartInstance.destroy();

    userState.appChartInstance = null;
    userState.timeChartInstance = null;
    userState.reportAppChartInstance = null;
    userState.reportTimeChartInstance = null;

    // Reset cost analysis state
    userState.costAnalysis = {
        period: 'month',
        selectedDate: new Date().toISOString().substring(0, 7),
        endDate: null,
        summaryCost: 0.00,
        appBreakdownData: [],
        timeSeriesData: [],
        availableYears: [],
        availableMonths: [],
    };

    // Re-initialize date inputs in the reports section to default (month)
    setupCostAnalysisDashboard();

    apiFetch('/api/logout', 'POST');
    updateUIVisibility();
    window.location.hash = ''; // Clear hash
}

function updateUIVisibility() {
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view'); // <--- CORRECTED ID
    const sidebar = document.getElementById('sidebar');

    if (userState.isLoggedIn) {
        loginView.classList.add('hidden');
        appView.classList.remove('hidden');

        // Update user info box
        document.getElementById('profile-name').textContent = userState.name;
        document.getElementById('profile-role').textContent = userState.role === 'admin' ? 'Administrator' : 'Customer';

        // Toggle admin/customer specific elements
        document.querySelectorAll('.admin-only').forEach(el => {
            if (userState.role === 'admin') {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        if (userState.role === 'admin') {
            handleAdminView();
        } else {
            // Customer logs in, their ID is the selected ID
            userState.selectedCustomerId = userState.id;
            document.getElementById('current-customer-display').textContent = `Viewing: ${userState.name} (Your Data)`;
            showView('dashboard');
        }

    } else {
        loginView.classList.remove('hidden');
        appView.classList.add('hidden');
    }
}

function showView(viewName) {
    // Remove active class from all sidebar items
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
    });

    // Add active class to the selected item
    const selectedItem = document.getElementById(`nav-${viewName}`);
    if (selectedItem) {
        selectedItem.classList.add('active');
    }

    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Show the selected content section
    const targetSection = document.getElementById(viewName);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    window.location.hash = `#${viewName}`;

    // Specific view logic
    if (viewName === 'customers' && userState.role === 'admin') {
        fetchCustomers();
    } else if (viewName === 'dashboard' && userState.selectedCustomerId) {
        fetchCustomerTotals(userState.selectedCustomerId);
        fetchCustomerApplications(userState.selectedCustomerId);
    } else if (viewName === 'reports' && userState.selectedCustomerId) {
        setupCostAnalysisDashboard();
    } else if (viewName === 'tips') {
        renderGeneralTips();
    }
}


/**
 * --- APPLICATION LIBRARY AND USAGE MANAGEMENT ---
 */

async function fetchAllApplications() {
    const result = await apiFetch('/api/applications');
    if (result.ok && result.data.success) {
        return result.data.applications;
    } else {
        showPopup(result.data.message || 'Failed to fetch available applications.', 'error');
        return [];
    }
}

function populateApplicationSelect() {
    const select = document.getElementById('add-app-name');
    select.innerHTML = '<option value="">Select an Application (e.g., LED Light Bulb)</option>';

    userState.allApplications.forEach(app => {
        const option = document.createElement('option');
        option.value = app.application_name;
        option.textContent = `${app.application_name} (${app.watts}W)`;
        option.setAttribute('data-watts', app.watts);
        select.appendChild(option);
    });
}

function updateWattsDisplay(isAddModal) {
    const select = document.getElementById(isAddModal ? 'add-app-name' : 'edit-app-name');
    const wattsDisplay = document.getElementById(isAddModal ? 'add-app-watts-display' : 'edit-app-watts-display');
    const wattsInput = document.getElementById(isAddModal ? 'add-app-watts' : 'edit-app-watts');

    if (select.options.length > 0 && select.selectedIndex > 0) {
        const selectedOption = select.options[select.selectedIndex];
        const watts = selectedOption.getAttribute('data-watts');
        wattsDisplay.value = watts + ' W';
        wattsInput.value = watts;
    } else {
        wattsDisplay.value = '';
        wattsInput.value = '';
    }
}

function openAddApplicationModal() {
    // Set default date/time to now
    document.getElementById('add-app-date').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    // Reset form and open
    document.getElementById('add-application-form').reset();
    document.getElementById('add-app-name').selectedIndex = 0; // Reset app select
    updateWattsDisplay(true); // Reset watts display
    openModal('add-application-modal');
}

async function addCustomerApplication(event) {
    event.preventDefault();
    const form = event.target;
    const customerId = userState.selectedCustomerId;

    const data = {
        application_name: form.application_name.value,
        qty: parseInt(form.qty.value),
        date_time: form.date_time.value,
        watts: parseInt(document.getElementById('add-app-watts').value),
        hours_day: parseFloat(form.hours_day.value),
    };

    if (isNaN(data.watts)) {
        showPopup('Please select an application first.', 'error');
        return;
    }

    const result = await apiFetch(`/api/customer/${customerId}/application`, 'POST', data);

    if (result.ok && result.data.success) {
        showPopup(result.data.message, 'success');
        closeModal('add-application-modal');
        fetchCustomerTotals(customerId);
        fetchCustomerApplications(customerId); // Refresh the list
        // Update dashboard charts
        fetchDashboardChartData(customerId);
    } else {
        showPopup(result.data.message || 'Failed to add application usage.', 'error');
    }
}

function openEditApplicationModal(application) {
    document.getElementById('edit-app-id').value = application.cust_app_id;
    document.getElementById('edit-app-name-display').textContent = application.application_name;
    document.getElementById('edit-app-date').value = application.date_time;
    document.getElementById('edit-app-watts-display').value = application.watts + ' W';
    document.getElementById('edit-app-qty').value = application.qty;
    document.getElementById('edit-app-hours').value = application.hours_day;
    // Store watts as a hidden attribute for calculation in the PUT request
    document.getElementById('edit-app-watts').value = application.watts;

    openModal('edit-application-modal');
}

async function editCustomerApplication(event) {
    event.preventDefault();
    const form = event.target;
    const custAppId = document.getElementById('edit-app-id').value;
    const customerId = userState.selectedCustomerId;

    const data = {
        qty: parseInt(form.qty.value),
        date_time: form.date_time.value,
        hours_day: parseFloat(form.hours_day.value),
        // Watts is not passed in the payload but calculated on the backend
    };

    const result = await apiFetch(`/api/customer/application/${custAppId}`, 'PUT', data);

    if (result.ok && result.data.success) {
        showPopup(result.data.message, 'success');
        closeModal('edit-application-modal');
        fetchCustomerTotals(customerId);
        fetchCustomerApplications(customerId); // Refresh the list
        fetchDashboardChartData(customerId);
    } else {
        showPopup(result.data.message || 'Failed to update application usage.', 'error');
    }
}

async function deleteCustomerApplication(custAppId, appName) {
    if (!confirm(`Are you sure you want to delete the usage record for ${appName}?`)) {
        return;
    }

    const customerId = userState.selectedCustomerId;
    const result = await apiFetch(`/api/customer/application/${custAppId}`, 'DELETE');

    if (result.ok && result.data.success) {
        showPopup(result.data.message, 'success');
        fetchCustomerTotals(customerId);
        fetchCustomerApplications(customerId); // Refresh the list
        fetchDashboardChartData(customerId);
    } else {
        showPopup(result.data.message || 'Failed to delete application usage.', 'error');
    }
}


/**
 * --- DASHBOARD AND TOTALS ---
 */

async function fetchCustomerTotals(customerId) {
    // Get Daily, Monthly, Yearly costs for the Dashboard Totals (current period)
    const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const month = new Date().toISOString().substring(0, 7); // YYYY-MM
    const year = new Date().toISOString().substring(0, 4); // YYYY

    // 1. Daily Total
    const dailyResult = await apiFetch(`/api/cost_analysis?customer_id=${customerId}&period=day&date=${today}`);
    if (dailyResult.ok) {
        document.getElementById('daily-cost-total').textContent = formatINR(dailyResult.data.summary_cost);
    }

    // 2. Monthly Total
    const monthlyResult = await apiFetch(`/api/cost_analysis?customer_id=${customerId}&period=month&date=${month}`);
    if (monthlyResult.ok) {
        document.getElementById('monthly-cost-total').textContent = formatINR(monthlyResult.data.summary_cost);
    }

    // 3. Yearly Total
    const yearlyResult = await apiFetch(`/api/cost_analysis?customer_id=${customerId}&period=year&date=${year}`);
    if (yearlyResult.ok) {
        document.getElementById('yearly-cost-total').textContent = formatINR(yearlyResult.data.summary_cost);
    }
}


async function fetchCustomerApplications(customerId) {
    if (!customerId) return;

    const result = await apiFetch(`/api/customer/${customerId}/applications`);

    if (result.ok && result.data.success) {
        const applications = result.data.applications;
        renderApplicationList(applications);
        fetchDashboardChartData(customerId);
    } else {
        showPopup(result.data.message || 'Failed to fetch usage data.', 'error');
        document.getElementById('customer-applications-table-body').innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">No usage records found.</td></tr>';
    }
}

function renderApplicationList(applications) {
    const tableBody = document.getElementById('customer-applications-table-body');
    if (!tableBody) return;

    if (applications.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">No usage records found.</td></tr>';
        return;
    }

    const rowsHtml = applications.map((app, index) => `
        <tr class="hover:bg-gray-50 transition duration-100" onmouseenter="renderSpecificTip('${app.application_name}')" onmouseleave="renderGeneralTips()">
            <td class="px-4 py-3">${index + 1}</td>
            <td class="px-4 py-3 font-medium text-gray-900">${app.application_name}</td>
            <td class="px-4 py-3 text-center">${app.qty}</td>
            <td class="px-4 py-3">${app.watts} W</td>
            <td class="px-4 py-3">${app.hours_day} h</td>
            <td class="px-4 py-3">${app.daily_kwh.toFixed(3)} kWh</td>
            <td class="px-4 py-3 font-semibold text-emerald-700">${formatINR(app.daily_cost)}</td>
            <td class="px-4 py-3 text-sm text-gray-500">${app.date_time}</td>
            <td class="px-4 py-3 text-right space-x-2">
                <button onclick="openEditApplicationModal(${JSON.stringify(app).replace(/"/g, '&quot;')})"
                    class="btn-edit text-xs">Edit</button>
                <button onclick="deleteCustomerApplication(${app.cust_app_id}, '${app.application_name}')"
                    class="btn-delete text-xs">Delete</button>
            </td>
        </tr>
    `).join('');

    tableBody.innerHTML = rowsHtml;
}

/**
 * --- DASHBOARD CHART RENDERING ---
 */

async function fetchDashboardChartData(customerId) {
    // Fetch data for the last 30 days (application breakdown) and current month trend (time series)
    const month = new Date().toISOString().substring(0, 7); // YYYY-MM

    const result = await apiFetch(`/api/cost_analysis?customer_id=${customerId}&period=month&date=${month}`);

    if (result.ok && result.data.success) {
        const data = result.data;
        // 1. Application Breakdown (Application Usage Breakdown)
        renderAppBreakdownChart(data.app_breakdown_data, 'app-chart', userState.appChartInstance);

        // 2. Daily Cost Trend for the current month
        renderTimeChart(data.daily_chart_data, 'time-chart', userState.timeChartInstance, 'Day');
    }
}

/**
 * --- ADMIN CUSTOMER MANAGEMENT ---
 */

async function handleAdminView() {
    await fetchCustomers();
    // Default to the first customer's dashboard or the customer management view if no customer selected
    if (userState.selectedCustomerId) {
        showView('dashboard');
    } else {
        showView('customers');
    }
}

async function fetchCustomers() {
    const result = await apiFetch('/api/admin/customers');
    if (result.ok && result.data.success) {
        userState.allCustomers = result.data.customers;
        renderCustomerList();
        populateCustomerSelect();

        // If an ID is set but customer list has changed, re-select (e.g., after an add/edit)
        if (userState.allCustomers.length > 0 && userState.selectedCustomerId === null) {
            selectCustomer(userState.allCustomers[0].customer_id);
        } else if (userState.selectedCustomerId) {
            // Ensure the selected customer's data is loaded after refresh/edit
            selectCustomer(userState.selectedCustomerId);
        }

    } else {
        showPopup(result.data.message || 'Failed to fetch customers.', 'error');
    }
}

function renderCustomerList() {
    const tableBody = document.getElementById('customer-list-body');
    if (!tableBody) return;

    if (userState.allCustomers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">No customers found.</td></tr>';
        return;
    }

    // Filter customers based on search input (basic search logic)
    const searchTerm = document.getElementById('customer-search')?.value.toLowerCase() || '';
    const filteredCustomers = userState.allCustomers.filter(customer =>
        customer.customer_name.toLowerCase().includes(searchTerm) ||
        customer.email_id.toLowerCase().includes(searchTerm)
    );

    const rowsHtml = filteredCustomers.map((customer, index) => `
        <tr class="hover:bg-gray-50 cursor-pointer ${customer.customer_id === userState.selectedCustomerId ? 'bg-emerald-100' : ''}" onclick="selectCustomer(${customer.customer_id})">
            <td class="px-4 py-3">${customer.customer_id}</td> <td class="px-4 py-3 font-medium text-gray-900">${customer.customer_name}</td>
            <td class="px-4 py-3 text-sm text-gray-500">${customer.email_id}</td>
            <td class="px-4 py-3 text-sm text-gray-500">${customer.phone_no || 'N/A'}</td>
            <td class="px-4 py-3 text-right space-x-2">
                <button onclick="event.stopPropagation(); openEditCustomerModal(${customer.customer_id})" class="btn-edit text-xs">Edit</button>
                <button onclick="event.stopPropagation(); deleteCustomer(${customer.customer_id}, '${customer.customer_name}')" class="btn-delete text-xs">Delete</button>
            </td>
        </tr>
    `).join('');
    tableBody.innerHTML = rowsHtml;
}

function searchCustomers() {
    renderCustomerList(); // Re-render the list with the current filter
}

function populateCustomerSelect() {
    const select = document.getElementById('customer-select');
    if (!select) return;

    select.innerHTML = '<option value="">Select a Customer...</option>';

    userState.allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.customer_id;
        option.textContent = `${customer.customer_name} (${customer.email_id})`;
        if (customer.customer_id === userState.selectedCustomerId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function selectCustomer(customerId) {
    if (!customerId) return;
    customerId = parseInt(customerId);
    userState.selectedCustomerId = customerId;

    const selectedCustomer = userState.allCustomers.find(c => c.customer_id === customerId);
    if (selectedCustomer) {
        document.getElementById('current-customer-display').textContent = `Viewing: ${selectedCustomer.customer_name} (${selectedCustomer.email_id})`;
    } else {
        document.getElementById('current-customer-display').textContent = 'Viewing: Customer not found';
    }

    // Re-render the customer list to highlight the selected row
    renderCustomerList();
    // Fetch data for the new customer
    fetchCustomerTotals(customerId);
    fetchCustomerApplications(customerId);
    // Also ensure the Reports section is ready for the new customer
    setupCostAnalysisDashboard();
}

function openAddCustomerModal() {
    document.getElementById('add-customer-form').reset();
    openModal('add-customer-modal');
}

async function addCustomer(event) {
    event.preventDefault();
    const form = event.target;
    const data = {
        name: form.name.value,
        email: form.email.value,
        phone: form.phone.value,
    };
    const result = await apiFetch('/api/admin/customer', 'POST', data);

    if (result.ok && result.data.success) {
        showPopup(result.data.message, 'success');
        closeModal('add-customer-modal');
        form.reset();
        await fetchCustomers(); // Refresh list
    } else {
        showPopup(result.data.message || 'Failed to add customer.', 'error');
    }
}

async function openEditCustomerModal(customerId) {
    const customer = userState.allCustomers.find(c => c.customer_id === customerId);
    if (!customer) {
        showPopup('Customer data not found locally.', 'error');
        return;
    }

    document.getElementById('edit-customer-id').value = customer.customer_id;
    document.getElementById('edit-customer-name').value = customer.customer_name;
    document.getElementById('edit-customer-email').value = customer.email_id;
    document.getElementById('edit-customer-phone').value = customer.phone_no;
    openModal('edit-customer-modal');
}

async function editCustomer(event) {
    event.preventDefault();
    const form = event.target;
    const customerId = document.getElementById('edit-customer-id').value;
    const data = {
        name: form.name.value,
        email: form.email.value,
        phone: form.phone.value,
    };
    const result = await apiFetch(`/api/admin/customer/${customerId}`, 'PUT', data);

    if (result.ok && result.data.success) {
        showPopup(result.data.message, 'success');
        closeModal('edit-customer-modal');
        await fetchCustomers(); // Refresh list
    } else {
        showPopup(result.data.message || 'Failed to edit customer.', 'error');
    }
}

async function deleteCustomer(customerId, customerName) {
    if (!confirm(`WARNING: Are you sure you want to delete customer ${customerName} and ALL their usage data? This cannot be undone.`)) {
        return;
    }

    const result = await apiFetch(`/api/admin/customer/${customerId}`, 'DELETE');

    if (result.ok && result.data.success) {
        showPopup(result.data.message, 'success');
        // If the selected customer was deleted, clear the selection
        if (userState.selectedCustomerId === customerId) {
            userState.selectedCustomerId = null;
            document.getElementById('current-customer-display').textContent = 'Viewing: N/A';
        }
        await fetchCustomers(); // Refresh list
    } else {
        showPopup(result.data.message || 'Failed to delete customer.', 'error');
    }
}

/**
 * --- REPORTING AND COST ANALYSIS ---
 */

function setupCostAnalysisDashboard() {
    // Reset to default 'month' view
    document.getElementById('analysis-period-select').value = userState.costAnalysis.period;
    handlePeriodChange(userState.costAnalysis.period);
    // Initial fetch when entering reports view
    fetchCostAnalysis();
}


function handlePeriodChange(period) {
    const dateInput = document.getElementById('analysis-date-input');
    const endDateInputContainer = document.getElementById('end-date-input-container');
    const endDateInput = document.getElementById('analysis-end-date-input');
    const dateInputContainer = document.getElementById('date-input-container');

    userState.costAnalysis.period = period;
    dateInputContainer.classList.remove('hidden');

    if (period === 'month') {
        dateInput.type = 'month';
        dateInput.value = new Date().toISOString().substring(0, 7); // YYYY-MM
        endDateInputContainer.classList.add('hidden');
        userState.costAnalysis.selectedDate = dateInput.value;
    } else if (period === 'year') {
        dateInput.type = 'number';
        dateInput.max = new Date().getFullYear();
        dateInput.value = new Date().getFullYear(); // YYYY
        endDateInputContainer.classList.add('hidden');
        userState.costAnalysis.selectedDate = dateInput.value;
    } else if (period === 'custom') {
        dateInput.type = 'date';
        dateInput.value = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10); // 30 days ago
        endDateInput.value = new Date().toISOString().substring(0, 10); // Today
        endDateInputContainer.classList.remove('hidden');
        userState.costAnalysis.selectedDate = dateInput.value;
        userState.costAnalysis.endDate = endDateInput.value;
    }
}

async function fetchCostAnalysis() {
    const customerId = userState.selectedCustomerId;
    if (!customerId) {
        showPopup('Please select a customer first.', 'error');
        return;
    }

    const period = userState.costAnalysis.period;
    let date_param = document.getElementById('analysis-date-input').value;
    let endDate_param = '';

    if (period === 'custom') {
        // For custom range, we use the start date as the main 'date' parameter and include the end date.
        // The backend will treat 'custom' as a special case for filtering.
        endDate_param = document.getElementById('analysis-end-date-input').value;
        if (new Date(date_param) > new Date(endDate_param)) {
            showPopup('Start date cannot be after end date.', 'error');
            return;
        }
        // For now, the backend logic simplifies custom range to just use the start date for filtering,
        // relying on the front-end display to denote the range. The current backend requires
        // period + single date, so we will set a flag.
        // A full custom range filter would require a different API call. We will stick to the month/year view for now,
        // or a simpler single-date filter for the custom range.

        // Sticking to the backend API: /api/cost_analysis?customer_id={id}&period={month/year/day}&date={YYYY-MM/YYYY/YYYY-MM-DD}
        // Custom is complex, will simplify 'custom' range to a 'day' view for the start date.
        // TODO: A more robust backend should handle custom ranges.
        showPopup('Note: Custom range filtering is a complex feature. Only the start date is used for filtering in this demo.', 'info');
    }

    // Clear the chart area before fetching new data
    renderAppBreakdownChart([], 'report-app-chart', userState.reportAppChartInstance);
    renderTimeChart([], 'report-time-chart', userState.reportTimeChartInstance, 'N/A');

    const result = await apiFetch(`/api/cost_analysis?customer_id=${customerId}&period=${period}&date=${date_param}`);

    if (result.ok && result.data.success) {
        const data = result.data;

        // 1. Update Summary Cost
        document.getElementById('summary-cost-total').textContent = formatINR(data.summary_cost);
        let label = '';
        if (period === 'month') {
            label = `Month of ${data.current_filter.date}`;
        } else if (period === 'year') {
            label = `Year ${data.current_filter.date}`;
        } else if (period === 'custom') {
            label = `Custom Range: ${date_param} to ${endDate_param}`;
        }
        document.getElementById('summary-period-label').textContent = label;

        // 2. Render Application Breakdown Chart
        renderAppBreakdownChart(data.app_breakdown_data, 'report-app-chart', userState.reportAppChartInstance);

        // 3. Render Time Series Chart
        if (period === 'year') {
            // Show monthly trend for a year
            renderTimeChart(data.monthly_chart_data, 'report-time-chart', userState.reportTimeChartInstance, 'Month');
        } else {
            // Show daily trend for a month or day
            renderTimeChart(data.daily_chart_data, 'report-time-chart', userState.reportTimeChartInstance, 'Day');
        }

        // 4. Update Available Filters (Years/Months dropdowns - not implemented in UI but data is available)
        userState.costAnalysis.availableYears = data.available_years;
        userState.costAnalysis.availableMonths = data.available_months;

    } else {
        showPopup(result.data.message || 'Failed to fetch cost analysis data.', 'error');
        document.getElementById('summary-cost-total').textContent = formatINR(0.00);
        document.getElementById('summary-period-label').textContent = 'Error Fetching Data';
    }
}


function renderAppBreakdownChart(data, canvasId, chartInstance) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
    }

    const labels = data.map(item => item.application_name);
    const costs = data.map(item => item.total_cost);

    const colors = labels.map((_, index) =>
        `hsl(${(index * 45) % 360}, 70%, 50%)`
    );

    userState[canvasId === 'app-chart' ? 'appChartInstance' : 'reportAppChartInstance'] = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cost Breakdown (₹)',
                data: costs,
                backgroundColor: colors,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    align: 'start',
                },
                title: {
                    display: false,
                }
            }
        }
    });
}

function renderTimeChart(data, canvasId, chartInstance, timeUnit) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
    }

    const labels = data ? data.map(item => item[timeUnit.toLowerCase() === 'day' ? 'day_label' : 'month_label']) : [];
    const costs = data ? data.map(item => item.total_cost) : [];

    userState[canvasId === 'time-chart' ? 'timeChartInstance' : 'reportTimeChartInstance'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `Total Cost per ${timeUnit} (₹)`,
                data: costs,
                backgroundColor: 'rgba(16, 185, 129, 0.7)', // Emerald 500
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Cost (₹)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: timeUnit
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}


/**
 * --- PDF GENERATION ---
 */
function generatePDF(customerId) {
    if (!customerId) {
        showPopup('Please select a customer to generate a report.', 'error');
        return;
    }

    showPopup('Generating PDF report...', 'info');

    apiFetch(`/api/customer/${customerId}/report_data`)
        .then(response => {
            if (response.ok && response.data.success) {
                const data = response.data;
                createPdfDocument(data);
            } else {
                showPopup('Failed to fetch data for PDF report.', 'error');
            }
        });
}

function createPdfDocument(data) {
    // Check for jspdf library
    if (!window.jspdf) {
        showPopup('PDF library failed to load.', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 10;

    // --- Header ---
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // Emerald color
    doc.text("Energy Consumption Report - BillBuddy", 105, y, null, null, "center");
    y += 10;

    // --- Customer Info ---
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55); // Dark text
    doc.text(`Customer: ${data.customer_info.customer_name}`, 15, y);
    y += 7;
    doc.setFontSize(10);
    doc.text(`Email: ${data.customer_info.email_id} | Phone: ${data.customer_info.phone_no || 'N/A'}`, 15, y);
    y += 10;

    // --- Summary Totals ---
    doc.setFontSize(14);
    doc.text("Consumption Summary", 15, y);
    doc.line(15, y + 1, 195, y + 1); // Separator line
    y += 8;

    doc.setFontSize(12);
    doc.text(`Total Energy Consumed (All Time): ${data.totals.total_kwh ? data.totals.total_kwh.toFixed(3) : '0.000'} kWh`, 15, y);
    doc.setTextColor(239, 68, 68); // Red color
    doc.text(`Total Estimated Cost (All Time): ${formatINR(data.totals.total_cost || 0.00)}`, 105, y, null, null, "left");
    doc.setTextColor(31, 41, 55);
    y += 10;

    // --- Usage Table ---
    doc.setFontSize(14);
    doc.text("Detailed Application Usage Log", 15, y);
    y += 5;

    const tableData = data.usage_data.map(app => [
        app.date_time,
        app.application_name,
        app.qty.toString(),
        `${app.watts} W`,
        `${app.hours_day} h`,
        `${app.daily_kwh.toFixed(3)} kWh`,
        formatINR(app.daily_cost)
    ]);

    doc.autoTable({
        startY: y,
        head: [['Date/Time', 'Application', 'QTY', 'Watts', 'Hrs/Day', 'Daily kWh', 'Daily Cost']],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [31, 41, 55], textColor: 255 }, // Dark header
        theme: 'striped',
        margin: { top: y }
    });

    // Final save
    const customerName = data.customer_info.customer_name.replace(/\s/g, '_');
    doc.save(`Energy_Report_${customerName}_${new Date().toISOString().substring(0, 10)}.pdf`);
    showPopup('PDF generated successfully!', 'success');
}


/**
 * --- TIPS AND RECOMMENDATIONS ---
 */

const APP_SPECIFIC_TIPS = {
    "Air Conditioner (Split 1.5 Ton)": "Tip: Set your thermostat to 24°C. Every degree below that can increase consumption by 6-8%. Clean filters monthly for optimal efficiency.",
    "Electric Water Heater (Geyser)": "Tip: Geysers are high-wattage. Only turn on the geyser 15-20 minutes before use, or invest in a timer to heat water right before you need it.",
    "Refrigerator (Standard)": "Tip: Check the door seals regularly. A poor seal can cause your fridge to run constantly, significantly increasing its daily consumption.",
    "Desktop Computer (Tower)": "Tip: Don't leave your desktop running idle overnight. Use 'Sleep' mode when away for short periods, or shut down completely if idle for hours.",
    "LED Light Bulb (10W)": "Tip: LEDs are already efficient, but make a habit of turning off lights in rooms you've left, and utilize natural daylight whenever possible.",
    "Electric Iron": "Tip: Iron a large batch of clothes at once. Heating the iron multiple times from cold uses a burst of energy each time.",
    "Washing Machine (Front Load)": "Tip: Use the cold-water setting for laundry. Heating water accounts for about 90% of the energy used by a washing machine.",
    "Microwave Oven": "Tip: Only use the microwave when necessary. Use it instead of your oven (if possible) as it is generally more energy efficient for heating small items.",
    // Add more tips for other applications up to 50
    "Ceiling Fan": "Tip: Use the fan to circulate air from open windows in the evening, allowing you to avoid using the AC for longer.",
    "50-inch LED TV": "Tip: Reduce the brightness and contrast settings on your TV. This minor adjustment can lower the TV's energy use without impacting the viewing experience.",
    "Electric Kettle": "Tip: Only boil the amount of water you need. Overfilling the kettle wastes both water and electricity."
};

function renderGeneralTips() {
    document.getElementById('specific-tip').classList.add('hidden');
    document.getElementById('general-tips').classList.remove('hidden');
}

function renderSpecificTip(appName) {
    const tip = APP_SPECIFIC_TIPS[appName];
    if (tip) {
        document.getElementById('specific-tip-app-name').textContent = appName;
        document.getElementById('specific-tip-content').textContent = tip;
        document.getElementById('general-tips').classList.add('hidden');
        document.getElementById('specific-tip').classList.remove('hidden');
    } else {
        renderGeneralTips();
    }
}


/**
 * --- INITIALIZATION ---
 */
document.addEventListener('DOMContentLoaded', () => {
    // Attach login handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', login);
    }

    // Attach application form handlers
    const addAppForm = document.getElementById('add-application-form');
    if (addAppForm) {
        addAppForm.addEventListener('submit', addCustomerApplication);
        document.getElementById('add-app-name').addEventListener('change', () => updateWattsDisplay(true));
    }

    const editAppForm = document.getElementById('edit-application-form');
    if (editAppForm) {
        editAppForm.addEventListener('submit', editCustomerApplication);
    }

    // Attach customer form handlers
    const addCustomerForm = document.getElementById('add-customer-form');
    if (addCustomerForm) {
        addCustomerForm.addEventListener('submit', addCustomer);
    }

    const editCustomerForm = document.getElementById('edit-customer-form');
    if (editCustomerForm) {
        editCustomerForm.addEventListener('submit', editCustomer);
    }

    // Customer Search Handler
    const customerSearchInput = document.getElementById('customer-search');
    if (customerSearchInput) {
        customerSearchInput.addEventListener('keyup', searchCustomers);
    }

    // Reports View Handler setup
    const analysisPeriodSelect = document.getElementById('analysis-period-select');
    if (analysisPeriodSelect) {
        // Ensure initial state is set
        analysisPeriodSelect.value = userState.costAnalysis.period;
        handlePeriodChange(analysisPeriodSelect.value);
        // The change handler is already attached in HTML
    }

    // Initial UI update and listener setup
    updateUIVisibility();
    initializeActivityListeners();
    resetActivityTimer();
});