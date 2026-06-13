const express = require("express");
const { MongoClient } = require("mongodb");
const path = require("path");
const cors = require("cors");

require("dotenv").config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const MONGODB_URI = process.env.MONGODB_URI;
let db;

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI not set. Please add it to environment secrets.");
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db("sample_airbnb");
    console.log("Connected to MongoDB — sample_airbnb");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
  }
}

function toPrice(val) {
  if (!val) return 0;
  return parseFloat(val.toString());
}

function mapListing(l) {
  return {
    listing_id: l._id.toString(),
    name: l.name || "Unnamed Property",
    summary: l.summary || "",
    price: toPrice(l.price),
    review_scores_rating: l.review_scores?.review_scores_rating ?? null,
    market: l.address?.market || "",
    country: l.address?.country || "",
    property_type: l.property_type || "",
    room_type: l.room_type || "",
    bedrooms: l.bedrooms ?? 0,
    bathrooms: l.bathrooms ?? 0,
    accommodates: l.accommodates ?? 1,
    amenities: l.amenities || [],
    picture_url: l.images?.picture_url || "",
    host_name: l.host?.host_name || "",
    host_picture_url: l.host?.host_picture_url || "",
  };
}

// GET /api/property-types
app.get("/api/property-types", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not connected" });
  try {
    const types = await db
      .collection("listingsAndReviews")
      .distinct("property_type");
    res.json({ types: types.filter(Boolean).sort() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/listings — search/filter with pagination
// Query params: market, property_type, bedrooms, page (default 1), limit (default 20)
app.get("/api/listings", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not connected" });
  try {
    const { market, property_type, bedrooms } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    // No filters → random sample for homepage (no pagination needed)
    if (!market && !property_type && !bedrooms) {
      const listings = await db
        .collection("listingsAndReviews")
        .aggregate([
          { $sample: { size: 20 } },
          {
            $project: {
              name: 1,
              summary: 1,
              price: 1,
              "review_scores.review_scores_rating": 1,
              "address.market": 1,
              "address.country": 1,
              property_type: 1,
              room_type: 1,
              bedrooms: 1,
              "images.picture_url": 1,
            },
          },
        ])
        .toArray();
      return res.json({
        listings: listings.map(mapListing),
        total: listings.length,
        page: 1,
        totalPages: 1,
      });
    }

    // Build filter query
    const query = {};
    if (market) {
      query["address.market"] = { $regex: new RegExp(market.trim(), "i") };
    }
    if (property_type) {
      query["property_type"] = property_type;
    }
    if (bedrooms && bedrooms !== "") {
      if (bedrooms.toString().endsWith("5plus")) {
        query["bedrooms"] = { $gte: 5 };
      } else {
        query["bedrooms"] = parseInt(bedrooms, 10);
      }
    }

    const projection = {
      name: 1,
      summary: 1,
      price: 1,
      "review_scores.review_scores_rating": 1,
      "address.market": 1,
      "address.country": 1,
      property_type: 1,
      room_type: 1,
      bedrooms: 1,
      "images.picture_url": 1,
    };

    const [listings, total] = await Promise.all([
      db
        .collection("listingsAndReviews")
        .find(query)
        .project(projection)
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection("listingsAndReviews").countDocuments(query),
    ]);

    res.json({
      listings: listings.map(mapListing),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Listings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/listing/:id — single listing detail + bookings
app.get("/api/listing/:id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not connected" });
  try {
    const id = req.params.id;

    const listing = await db
      .collection("listingsAndReviews")
      .findOne({ _id: id });
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const bookings = await db
      .collection("bookings")
      .find({ listingID: id })
      .project({
        arrivalDate: 1,
        departureDate: 1,
        numberOfGuests: 1,
        guest: 1,
        clientID: 1,
      })
      .toArray();

    res.json({
      listing: {
        ...mapListing(listing),
        description: listing.description || "",
        existing_bookings: bookings.map((b) => ({
          arrival: b.arrivalDate,
          departure: b.departureDate,
          guests: b.numberOfGuests,
          guest: b.guest || [],
        })),
      },
    });
  } catch (err) {
    console.error("Listing detail error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bookings — upsert client, then create booking
app.post("/api/bookings", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not connected" });
  try {
    const {
      listing_id,
      client_name,
      email_address,
      daytime_phone_number,
      mobile_number,
      postal_address,
      home_address,
      arrival_date,
      departure_date,
      number_of_guests,
      deposit_paid,
    } = req.body;

    // Validate required fields
    if (
      !listing_id ||
      !client_name ||
      !email_address ||
      !arrival_date ||
      !departure_date
    ) {
      return res.status(400).json({
        error:
          "listing_id, client_name, email_address, arrival_date and departure_date are required",
      });
    }

    const arrival = new Date(arrival_date);
    const departure = new Date(departure_date);
    if (isNaN(arrival) || isNaN(departure)) {
      return res.status(400).json({ error: "Invalid dates provided" });
    }
    if (departure <= arrival) {
      return res.status(400).json({ error: "Departure must be after arrival" });
    }

    const nights = Math.ceil((departure - arrival) / (1000 * 60 * 60 * 24));

    // Verify listing exists
    const listing = await db
      .collection("listingsAndReviews")
      .findOne({ _id: listing_id });
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    // Upsert registeredClient by email
    const clientsCol = db.collection("registeredClients");
    const existingClient = await clientsCol.findOne({
      emailAddress: email_address,
    });

    let clientID;
    let isNewClient = false;

    if (existingClient) {
      clientID = existingClient._id;
      // Update fields that may have changed
      await clientsCol.updateOne(
        { _id: clientID },
        {
          $set: {
            name: client_name,
            daytimePhoneNumber:
              daytime_phone_number || existingClient.daytimePhoneNumber || "",
            mobileNumber: mobile_number || existingClient.mobileNumber || "",
            postalAddress: postal_address || existingClient.postalAddress || "",
            homeAddress: home_address || existingClient.homeAddress || "",
          },
        },
      );
    } else {
      isNewClient = true;
      clientID = "C" + Date.now();
      await clientsCol.insertOne({
        _id: clientID,
        name: client_name,
        emailAddress: email_address,
        daytimePhoneNumber: daytime_phone_number || "",
        mobileNumber: mobile_number || "",
        postalAddress: postal_address || "",
        homeAddress: home_address || "",
      });
    }

    // Calculate financials
    const price = toPrice(listing.price);
    const deposit = parseFloat(deposit_paid) || 0;
    const total = nights * price;
    const balance = Math.max(0, total - deposit);

    const bookingId = "B" + Date.now();
    const balanceDueDate = new Date(arrival);
    balanceDueDate.setDate(balanceDueDate.getDate() - 7);

    const nameParts = client_name.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const bookingDoc = {
      _id: bookingId,
      listingID: listing_id,
      clientID,
      arrivalDate: arrival,
      departureDate: departure,
      depositPaid: deposit,
      balanceDue: balance,
      balanceDueDate,
      numberOfGuests: parseInt(number_of_guests, 10) || 1,
      guest: [{ firstName, lastName, email: email_address }],
    };

    await db.collection("bookings").insertOne(bookingDoc);

    res.json({
      success: true,
      is_new_client: isNewClient,
      booking: {
        booking_id: bookingId,
        client_id: clientID,
        listing_id,
        listing_name: listing.name,
        client_name,
        email_address,
        arrival_date: arrival.toISOString(),
        departure_date: departure.toISOString(),
        nights,
        number_of_guests: bookingDoc.numberOfGuests,
        deposit_paid: deposit,
        balance_due: balance,
        balance_due_date: balanceDueDate.toISOString(),
        price_per_night: price,
        total,
      },
    });
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/:listing_id
app.get("/api/bookings/:listing_id", async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not connected" });
  try {
    const bookings = await db
      .collection("bookings")
      .find({ listingID: req.params.listing_id })
      .toArray();
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
