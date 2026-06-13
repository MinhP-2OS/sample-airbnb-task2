const API_BASE = "http://127.0.0.1:5000";

const params = new URLSearchParams(window.location.search);
const listingId = params.get("listing_id");

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(val) {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d)
    ? val
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

async function loadListingDetails() {
  const loading = document.getElementById("loadingDetail");
  const errorDiv = document.getElementById("errorDetail");
  const content = document.getElementById("bookingContent");

  if (!listingId) {
    loading.classList.add("d-none");
    errorDiv.classList.remove("d-none");
    document.getElementById("errorMsg").textContent =
      "No listing selected. Please go back and choose a property.";
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/listing/${encodeURIComponent(listingId)}`,
    );
    const data = await res.json();

    loading.classList.add("d-none");

    if (!res.ok || data.error) {
      errorDiv.classList.remove("d-none");
      document.getElementById("errorMsg").textContent =
        data.error || "Listing not found.";
      return;
    }

    content.classList.remove("d-none");
    populateDetails(data.listing);
  } catch (e) {
    loading.classList.add("d-none");
    errorDiv.classList.remove("d-none");
    document.getElementById("errorMsg").textContent =
      `Failed to load property: ${e.message}`;
  }
}

function populateDetails(listing) {
  window._listing = listing;

  if (listing.picture_url) {
    document.getElementById("propertyImage").classList.remove("d-none");
    const img = document.getElementById("propImg");
    img.src = listing.picture_url;
    img.alt = listing.name;
    img.onerror = () =>
      document.getElementById("propertyImage").classList.add("d-none");
  }

  document.getElementById("propName").textContent = listing.name;
  document.getElementById("propType").innerHTML =
    `<i class="bi bi-building me-1"></i>${escapeHtml(listing.property_type || "Property")}`;
  document.getElementById("propBedrooms").innerHTML =
    `<i class="bi bi-door-closed me-1"></i>${listing.bedrooms} bedroom${listing.bedrooms !== 1 ? "s" : ""}`;
  document.getElementById("propBathrooms").innerHTML =
    `<i class="bi bi-droplet me-1"></i>${listing.bathrooms} bath${listing.bathrooms !== 1 ? "s" : ""}`;
  document.getElementById("propAccommodates").innerHTML =
    `<i class="bi bi-people me-1"></i>Up to ${listing.accommodates} guests`;
  document.getElementById("propLocation").innerHTML =
    `<i class="bi bi-geo-alt me-1"></i>${escapeHtml(listing.market)}${listing.country ? ", " + escapeHtml(listing.country) : ""}`;

  const rating = listing.review_scores_rating;
  document.getElementById("propRating").textContent =
    rating !== null && rating !== undefined ? rating : "N/A";
  document.getElementById("propPrice").textContent = listing.price
    ? listing.price.toFixed(2)
    : "?";
  document.getElementById("propSummary").textContent =
    listing.summary || listing.description || "No description available.";

  if (listing.amenities && listing.amenities.length > 0) {
    document.getElementById("amenitiesSection").classList.remove("d-none");
    const list = document.getElementById("amenitiesList");
    listing.amenities.slice(0, 12).forEach((a) => {
      const tag = document.createElement("span");
      tag.className = "amenity-tag";
      tag.textContent = a;
      list.appendChild(tag);
    });
  }

  if (listing.host_name) {
    document.getElementById("hostName").textContent = listing.host_name;
    if (listing.host_picture_url) {
      const wrapper = document.getElementById("hostImgWrapper");
      const img = document.getElementById("hostImg");
      wrapper.classList.remove("d-none");
      img.src = listing.host_picture_url;
      img.onerror = () => wrapper.classList.add("d-none");
    }
  }

  if (listing.existing_bookings && listing.existing_bookings.length > 0) {
    document
      .getElementById("existingBookingsSection")
      .classList.remove("d-none");
    const bList = document.getElementById("existingBookingsList");
    listing.existing_bookings.forEach((b) => {
      const guestName =
        b.guest && b.guest.length > 0
          ? `${b.guest[0].firstName || ""} ${b.guest[0].lastName || ""}`.trim()
          : "Guest";
      const div = document.createElement("div");
      div.className = "card mb-2 border-0 bg-light";
      div.innerHTML = `
        <div class="card-body py-2 px-3">
          <div class="row">
            <div class="col-5"><small class="text-muted">Guest</small><br>
              <strong>${escapeHtml(guestName)}</strong></div>
            <div class="col-3"><small class="text-muted">Arrival</small><br>
              <small>${formatDate(b.arrival)}</small></div>
            <div class="col-4"><small class="text-muted">Departure</small><br>
              <small>${formatDate(b.departure)}</small></div>
          </div>
        </div>`;
      bList.appendChild(div);
    });
  }

  // Set minimum dates to today
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("arrivalDate").min = today;
  document.getElementById("departureDate").min = today;

  // Wire up live price summary
  ["arrivalDate", "departureDate"].forEach((id) =>
    document.getElementById(id).addEventListener("change", updatePriceSummary),
  );
  document
    .getElementById("depositPaid")
    .addEventListener("input", updatePriceSummary);

  // Auto-fill home address from postal if blank
  document.getElementById("postalAddress").addEventListener("blur", () => {
    const home = document.getElementById("homeAddress");
    if (!home.value.trim()) {
      home.value = document.getElementById("postalAddress").value;
    }
  });
}

function updatePriceSummary() {
  const arrival = document.getElementById("arrivalDate").value;
  const departure = document.getElementById("departureDate").value;
  const deposit = parseFloat(document.getElementById("depositPaid").value) || 0;
  const listing = window._listing;

  const summary = document.getElementById("priceSummary");
  if (arrival && departure && listing && listing.price) {
    const arrDate = new Date(arrival);
    const depDate = new Date(departure);
    const nights = Math.ceil((depDate - arrDate) / (1000 * 60 * 60 * 24));
    if (nights > 0) {
      const total = nights * listing.price;
      const balance = Math.max(0, total - deposit);
      const balanceDue = new Date(arrDate);
      balanceDue.setDate(balanceDue.getDate() - 7);

      summary.classList.remove("d-none");
      document.getElementById("sumPrice").textContent =
        listing.price.toFixed(2);
      document.getElementById("sumNights").textContent = nights;
      document.getElementById("sumTotal").textContent = total.toFixed(2);
      document.getElementById("sumDeposit").textContent = deposit.toFixed(2);
      document.getElementById("sumBalance").textContent = balance.toFixed(2);
      document.getElementById("sumBalanceDueDate").textContent =
        formatDate(balanceDue);
    } else {
      summary.classList.add("d-none");
    }
  } else {
    summary.classList.add("d-none");
  }
}

document.getElementById("bookingForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const errorDiv = document.getElementById("bookingError");
  const infoDiv = document.getElementById("bookingInfo");
  errorDiv.classList.add("d-none");
  infoDiv.classList.add("d-none");

  const arrival_date = document.getElementById("arrivalDate").value;
  const departure_date = document.getElementById("departureDate").value;
  const client_name = document.getElementById("clientName").value.trim();
  const email_address = document.getElementById("emailAddress").value.trim();

  // Client-side validation
  if (!client_name) {
    errorDiv.textContent = "Please enter the guest's full name.";
    errorDiv.classList.remove("d-none");
    document.getElementById("clientName").focus();
    return;
  }
  if (!email_address) {
    errorDiv.textContent = "Please enter the guest's email address.";
    errorDiv.classList.remove("d-none");
    document.getElementById("emailAddress").focus();
    return;
  }
  if (!arrival_date || !departure_date) {
    errorDiv.textContent = "Please select arrival and departure dates.";
    errorDiv.classList.remove("d-none");
    return;
  }
  if (new Date(departure_date) <= new Date(arrival_date)) {
    errorDiv.textContent = "Departure date must be after arrival date.";
    errorDiv.classList.remove("d-none");
    return;
  }

  const postalAddress = document.getElementById("postalAddress").value.trim();
  const homeAddress =
    document.getElementById("homeAddress").value.trim() || postalAddress;

  const submitBtn = e.target.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span>Confirming...';

  try {
    const payload = {
      listing_id: listingId,
      client_name,
      email_address,
      daytime_phone_number: document
        .getElementById("daytimePhone")
        .value.trim(),
      mobile_number: document.getElementById("mobileNumber").value.trim(),
      postal_address: postalAddress,
      home_address: homeAddress,
      arrival_date,
      departure_date,
      number_of_guests: document.getElementById("numGuests").value,
      deposit_paid: document.getElementById("depositPaid").value || 0,
    };

    const res = await fetch(`${API_BASE}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Booking failed");

    const b = data.booking;
    const qs = new URLSearchParams({
      booking_id: b.booking_id,
      client_id: b.client_id,
      is_new_client: data.is_new_client ? "1" : "0",
      listing_name: b.listing_name,
      client_name: b.client_name,
      email_address: b.email_address,
      arrival: b.arrival_date,
      departure: b.departure_date,
      nights: b.nights,
      guests: b.number_of_guests,
      deposit: b.deposit_paid,
      balance: b.balance_due,
      balance_due_date: b.balance_due_date,
      total: b.total,
    });
    window.location.href = `confirmation.html?${qs}`;
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.innerHTML =
      '<i class="bi bi-calendar-check me-2"></i>Confirm Booking';
    errorDiv.textContent = err.message;
    errorDiv.classList.remove("d-none");
  }
});

loadListingDetails();
