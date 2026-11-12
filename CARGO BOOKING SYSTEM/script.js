const storageKey = 'cargoBookings';
const idKey = 'nextCargoId';
const activityKey = 'cargoBookActivity12601274';
const statuses = ['Booked', 'Dispatched', 'In Transit', 'Arriving', 'Delayed', 'Delivered'];
const progressSteps = ['Booked', 'Dispatched', 'In Transit', 'Arriving', 'Delivered'];

const form = document.getElementById('bookingForm');
const search = document.getElementById('search');
const statusFilter = document.getElementById('statusFilter');
const table = document.getElementById('bookingTable');
let selectedId = null;

function readSavedArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return Array.isArray(value) ? value : [];
    } catch (error) {
        return [];
    }
}

let bookings = readSavedArray(storageKey).filter(item =>
    item && typeof item.id === 'string' &&
    typeof item.pickup === 'string' && typeof item.destination === 'string'
);
let activity = readSavedArray(activityKey);

// Use the old next ID too, so old bookings will not be overwritten.
const highestId = bookings.reduce(function(max, item) {
    const num = Number(item.id.replace(/^CB/, ''));
    return Number.isInteger(num) ? Math.max(max, num) : max;
}, 1000);
let nextId = Math.max(1001, Number(localStorage.getItem(idKey)) || 0, highestId + 1);

function saveBookings() {
    localStorage.setItem(storageKey, JSON.stringify(bookings));
    localStorage.setItem(idKey, String(nextId));
}

function addActivity(id, message) {
    activity.unshift({ id: id, message: message, time: new Date().toISOString() });
    activity = activity.slice(0, 12);
    localStorage.setItem(activityKey, JSON.stringify(activity));
}

function showMessage(text, isError) {
    const message = document.getElementById('message');
    message.textContent = text;
    message.style.color = isError ? '#b42323' : '#197447';
}

function formatDate(date) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Not set';
    const day = new Date(date + 'T00:00:00');
    return Number.isNaN(day.getTime()) ? 'Not set' :
        day.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function makeCell(row, text) {
    const cell = document.createElement('td');
    cell.textContent = text == null ? '' : String(text);
    row.appendChild(cell);
    return cell;
}

// Add a new cargo booking.
form.addEventListener('submit', function(event) {
    event.preventDefault();

    const sender = document.getElementById('sender').value.trim();
    const receiver = document.getElementById('receiver').value.trim();
    const pickup = document.getElementById('pickup').value.trim();
    const destination = document.getElementById('destination').value.trim();
    const cargoType = document.getElementById('cargoType').value;
    const weight = Number(document.getElementById('weight').value);
    const eta = document.getElementById('eta').value;

    if (!sender || !receiver || !pickup || !destination || !cargoType || !eta || !Number.isFinite(weight) || weight <= 0) {
        showMessage('Please complete all the booking details.', true);
        return;
    }
    if (pickup.toLowerCase() === destination.toLowerCase()) {
        showMessage('Pickup and destination cannot be the same.', true);
        return;
    }

    const booking = {
        id: 'CB' + nextId,
        sender: sender,
        receiver: receiver,
        pickup: pickup,
        destination: destination,
        cargoType: cargoType,
        weight: weight,
        eta: eta,
        status: 'Booked',
        progressStatus: 'Booked'
    };

    nextId++;
    bookings.push(booking);
    selectedId = booking.id;
    saveBookings();
    addActivity(booking.id, 'New cargo booked from ' + pickup + ' to ' + destination);
    form.reset();
    search.value = '';
    statusFilter.value = 'All';
    showMessage('Shipment booked successfully! Booking ID: ' + booking.id, false);
    refreshPage();
});

function getFilteredBookings() {
    const term = search.value.trim().toLowerCase();
    return bookings.filter(function(item) {
        const details = [item.id, item.sender, item.receiver,
            item.pickup, item.destination, item.cargoType].join(' ').toLowerCase();
        return details.includes(term) &&
            (statusFilter.value === 'All' || item.status === statusFilter.value);
    });
}

// Display the table. Track and Delete are buttons on each row.
function showBookings() {
    const visible = getFilteredBookings();
    table.replaceChildren();

    if (!visible.some(item => item.id === selectedId)) {
        selectedId = visible.length ? visible[0].id : null;
    }

    if (visible.length === 0) {
        const row = document.createElement('tr');
        const cell = makeCell(row, bookings.length === 0 ?
            'No bookings yet. Add your first cargo shipment above.' : 'No matching shipments found.');
        cell.colSpan = 10;
        cell.className = 'empty';
        table.appendChild(row);
        return;
    }

    visible.forEach(function(item) {
        const row = document.createElement('tr');
        if (item.id === selectedId) row.className = 'selected';

        [item.id, item.sender, item.receiver, item.pickup,
            item.destination, item.cargoType, (item.weight || '—') + ' kg',
            formatDate(item.eta)].forEach(function(value) {
            makeCell(row, value);
        });

        const statusCell = document.createElement('td');
        statusCell.className = 'status-cell';
        const dropdown = document.createElement('select');
        dropdown.setAttribute('aria-label', 'Status for ' + item.id);
        statuses.forEach(function(status) {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            dropdown.appendChild(option);
        });
        dropdown.value = statuses.includes(item.status) ? item.status : 'Booked';
        dropdown.addEventListener('change', function() {
            selectedId = item.id;
            changeStatus(item.id, dropdown.value);
        });
        statusCell.appendChild(dropdown);
        row.appendChild(statusCell);

        const actionCell = document.createElement('td');
        const buttons = document.createElement('div');
        buttons.className = 'action-buttons';
        const trackButton = document.createElement('button');
        trackButton.type = 'button';
        trackButton.className = 'small-btn';
        trackButton.textContent = 'Track';
        trackButton.addEventListener('click', function() {
            selectedId = item.id;
            showBookings();
            showTracking();
        });
        buttons.appendChild(trackButton);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-btn';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', function() {
            deleteBooking(item.id);
        });
        buttons.appendChild(deleteButton);
        actionCell.appendChild(buttons);
        row.appendChild(actionCell);
        table.appendChild(row);
    });
}

function changeStatus(id, newStatus) {
    const booking = bookings.find(item => item.id === id);
    if (!booking || !statuses.includes(newStatus)) return;
    if (booking.status === newStatus) return;

    // A delayed shipment keeps the last progress step reached.
    if (newStatus !== 'Delayed') booking.progressStatus = newStatus;
    if (!booking.progressStatus) booking.progressStatus = 'Booked';
    booking.status = newStatus;
    saveBookings();
    addActivity(id, 'Shipment status changed to ' + newStatus);
    refreshPage();
}

function deleteBooking(id) {
    if (!confirm('Delete cargo shipment ' + id + '?')) return;
    bookings = bookings.filter(item => item.id !== id);
    if (selectedId === id) selectedId = null;
    saveBookings();
    addActivity(id, 'Shipment deleted');
    refreshPage();
}

// Tracking section shows each stage and the route for one booking.
function showTracking() {
    const booking = bookings.find(item => item.id === selectedId);
    const stepElements = document.querySelectorAll('#trackingSteps .step');
    const dropdown = document.getElementById('selectedStatus');
    const button = document.getElementById('updateStatusButton');

    if (!booking) {
        document.getElementById('trackingId').textContent = 'No shipment selected';
        document.getElementById('trackingStatus').textContent = '—';
        document.getElementById('trackingStatus').className = 'status-tag';
        document.getElementById('routeFrom').textContent = '—';
        document.getElementById('routeTo').textContent = '—';
        document.getElementById('trackingEta').textContent = '—';
        document.getElementById('trackingNote').textContent =
            'Add or select a shipment to view its details.';
        stepElements.forEach(step => step.classList.remove('done'));
        dropdown.disabled = true;
        button.disabled = true;
        return;
    }

    const status = statuses.includes(booking.status) ? booking.status : 'Booked';
    document.getElementById('trackingId').textContent = booking.id;
    document.getElementById('trackingStatus').textContent = status;
    document.getElementById('trackingStatus').className =
        'status-tag ' + status.toLowerCase().replace(' ', '-');
    document.getElementById('routeFrom').textContent = booking.pickup;
    document.getElementById('routeTo').textContent = booking.destination;
    document.getElementById('trackingEta').textContent = formatDate(booking.eta);

    const previousStage = booking.progressStatus || 'Booked';
    const currentStage = status === 'Delayed' ? previousStage : status;
    const index = Math.max(0, progressSteps.indexOf(currentStage));
    stepElements.forEach(function(step, position) {
        step.classList.toggle('done', position <= index);
    });

    const notes = {
        'Booked': 'The cargo request has been registered.',
        'Dispatched': 'Cargo has been dispatched.',
        'In Transit': 'Cargo is moving towards its destination.',
        'Arriving': 'Cargo is approaching the destination.',
        'Delayed': 'Shipment is delayed. Last completed step is shown above.',
        'Delivered': 'Cargo has been delivered.'
    };
    document.getElementById('trackingNote').textContent = notes[status];
    dropdown.value = status;
    dropdown.disabled = false;
    button.disabled = false;
}

function showAnalytics() {
    const counts = {};
    statuses.forEach(status => counts[status] = 0);
    bookings.forEach(function(item) {
        if (counts[item.status] !== undefined) counts[item.status]++;
    });

    const total = bookings.length;
    document.getElementById('totalCount').textContent = total;
    document.getElementById('transitCount').textContent = counts['In Transit'];
    document.getElementById('deliveredCount').textContent = counts['Delivered'];
    document.getElementById('delayedCount').textContent = counts['Delayed'];

    const bars = document.getElementById('analyticsBars');
    bars.replaceChildren();
    statuses.forEach(function(status) {
        const row = document.createElement('div');
        row.className = 'analysis-row ' + status.toLowerCase().replace(' ', '-');
        const name = document.createElement('span');
        name.textContent = status;
        const bar = document.createElement('div');
        bar.className = 'analysis-bar';
        const fill = document.createElement('div');
        fill.style.width = (total ? 100 * counts[status] / total : 0) + '%';
        bar.appendChild(fill);
        const number = document.createElement('strong');
        number.textContent = counts[status];
        row.append(name, bar, number);
        bars.appendChild(row);
    });

    const percentage = total ? Math.round(100 * counts['Delivered'] / total) : 0;
    document.getElementById('deliveryPercent').textContent = percentage + '%';
    document.getElementById('deliveryBar').style.width = percentage + '%';
}

function showActivity() {
    const list = document.getElementById('activityList');
    list.replaceChildren();
    if (activity.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'small';
        empty.textContent = 'No recent activity.';
        list.appendChild(empty);
        return;
    }
    activity.slice(0, 8).forEach(function(item) {
        const row = document.createElement('p');
        const time = document.createElement('time');
        const date = new Date(item.time);
        time.textContent = Number.isNaN(date.getTime()) ? '' :
            date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        row.appendChild(time);
        const strong = document.createElement('strong');
        strong.textContent = item.id + ': ';
        row.appendChild(strong);
        row.appendChild(document.createTextNode(item.message));
        list.appendChild(row);
    });
}

function refreshPage() {
    showBookings();
    showTracking();
    showAnalytics();
    showActivity();
}

search.addEventListener('input', refreshPage);
statusFilter.addEventListener('change', refreshPage);
document.getElementById('updateStatusButton').addEventListener('click', function() {
    if (selectedId) changeStatus(selectedId, document.getElementById('selectedStatus').value);
});

refreshPage();