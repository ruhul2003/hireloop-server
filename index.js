const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const allowedOrigins = [
  "http://localhost:3000",
  "https://career-bridge-client-xi.vercel.app"
];

// CORS Configuration
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
}));

// Parsers (Declared only once)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root Health Check Route
app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

// MongoDB Client Initialization
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Global Database References
let db;
let jobCollection;
let companyCollection;
let userscollection;
let applicationColection;
let plansCollection;
let subscriptionCollection;
let savedJobsCollection;

// Shared lazy connection logic for Serverless Environments
async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("hireloop_db");
    
    // Initialize Collections
    jobCollection = db.collection("jobs");
    companyCollection = db.collection("companies");
    userscollection = db.collection("user");
    applicationColection = db.collection("applications");
    plansCollection = db.collection("plans");
    subscriptionCollection = db.collection("subscriptions");
    savedJobsCollection = db.collection("saved_jobs");
    
    console.log("Connected to MongoDB cluster dynamically.");
  }
  return db;
}

// Middleware to guarantee database connection before routing requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection runtime failure:", error);
    res.status(500).json({ success: false, message: "Internal Database Connection Error" });
  }
});

// =========================================================================
// API ROUTES (Synchronously registered outside connection handlers)
// =========================================================================

// GET jobs
app.get("/api/jobs", async (req, res) => {
  try {
    const query = {};

    if (req.query.companyId) {
      query.companyId = req.query.companyId;
    }
    if (req.query.status) {
      query.status = req.query.status;
    }

    const cursor = jobCollection.find(query);
    const result = await cursor.toArray();

    res.json(result); 
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST job
app.post("/api/jobs", async (req, res) => {
  try {
    const job = req.body;

    const newJob = {
      ...job,
      createdAt: new Date(),
    };

    console.log("=== JOB PAYLOAD RECEIVED ===");
    console.log(JSON.stringify(job, null, 2));

    if (!job.companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required to post a job",
      });
    }

    const result = await jobCollection.insertOne(newJob);

    res.json({
      success: true,
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error posting job:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET single job details
app.get("/api/jobs/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await jobCollection.findOne(query);
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Subscription management (Fixed response leak)
app.post("/api/subscription", async (req, res) => {
  try {
    const data = req.body;

    const subInfo = {
      ...data,
      createdAt: new Date(),
    };
    
    const result = await subscriptionCollection.insertOne(subInfo);

    const filter = { email: data.email };
    const updateDocument = {
      $set: {
        plan: data.planId,
      },
    };
    const updateResult = await userscollection.updateOne(filter, updateDocument);
    
    // Consolidated single integrated response
    res.json({
      success: true,
      subscriptionResult: result,
      userUpdateResult: updateResult
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET applications
app.get('/api/applications', async (req, res) => {
  try {
    const query = {};
    if (req.query.applicantId) {
      query.applicantId = req.query.applicantId;
    }
    if (req.query.jobId) {
      query.jobId = req.query.jobId;
    }
    const cursor = applicationColection.find(query);
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST application
app.post('/api/applications', async (req, res) => {
  try {
    const { jobId, applicantId, applicantEmail, applicantName, resume, coverLetter } = req.body;
    if (!jobId || !applicantId) {
      return res.status(400).json({ success: false, message: "jobId and applicantId are required" });
    }

    // Check for duplicate application
    const existing = await applicationColection.findOne({ jobId, applicantId });
    if (existing) {
      return res.status(400).json({ success: false, message: "You have already applied for this job" });
    }

    // Fetch job details for denormalized snapshot storage
    let jobDetails = {};
    try {
      const job = await jobCollection.findOne({ _id: new ObjectId(jobId) });
      if (job) {
        jobDetails = {
          jobTitle: job.jobTitle,
          companyName: job.companyName,
          jobType: job.jobType,
          isRemote: job.isRemote,
          location: job.location
        };
      }
    } catch (e) {
      console.error("Error fetching job details for application:", e);
    }

    const newApplication = {
      jobId,
      applicantId,
      applicantEmail,
      applicantName,
      resume,
      coverLetter,
      ...jobDetails,
      status: "Applied",
      appliedAt: new Date()
    };

    const result = await applicationColection.insertOne(newApplication);
    res.json({
      success: true,
      insertedId: result.insertedId
    });
  } catch (error) {
    console.error("Error posting application:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET user profile
app.get("/api/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const user = await userscollection.findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH update user profile
app.patch("/api/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { fullName, email, title, skills } = req.body;

    const updateDoc = {
      $set: {
        fullName,
        email,
        title,
        skills: skills || [],
        updatedAt: new Date()
      }
    };

    const result = await userscollection.updateOne(
      { _id: new ObjectId(id) },
      updateDoc
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET saved jobs
app.get('/api/saved-jobs', async (req, res) => {
  try {
    const query = {};
    if (req.query.userId) {
      query.userId = req.query.userId;
    }
    if (req.query.jobId) {
      query.jobId = req.query.jobId;
    }
    const result = await savedJobsCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST save job
app.post('/api/saved-jobs', async (req, res) => {
  try {
    const { jobId, userId } = req.body;
    if (!jobId || !userId) {
      return res.status(400).json({ success: false, message: "jobId and userId are required" });
    }

    // Check if already saved
    const existing = await savedJobsCollection.findOne({ jobId, userId });
    if (existing) {
      return res.status(400).json({ success: false, message: "Job already saved" });
    }

    // Fetch job details for denormalized snapshot storage
    let jobDetails = {};
    try {
      const job = await jobCollection.findOne({ _id: new ObjectId(jobId) });
      if (job) {
        jobDetails = {
          jobTitle: job.jobTitle,
          companyName: job.companyName,
          location: job.location,
          isRemote: job.isRemote,
          minSalary: job.minSalary,
          maxSalary: job.maxSalary,
          currency: job.currency,
          deadline: job.deadline,
          status: job.status || 'active'
        };
      }
    } catch (e) {
      console.error("Error fetching job details for saved job:", e);
    }

    const newSavedJob = {
      jobId,
      userId,
      ...jobDetails,
      savedAt: new Date()
    };

    const result = await savedJobsCollection.insertOne(newSavedJob);
    res.json({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE saved job
app.delete('/api/saved-jobs', async (req, res) => {
  try {
    const { jobId, userId } = req.query;
    if (!jobId || !userId) {
      return res.status(400).json({ success: false, message: "jobId and userId are required" });
    }

    const result = await savedJobsCollection.deleteOne({ jobId, userId });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET plans
app.get("/api/plans", async (req, res) => {
  try {
    const query = {};
    if (req.query.plan_id) {
      query.id = req.query.plan_id;
    }
    const plan = await plansCollection.findOne(query);
    res.send(plan);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST companies
app.post("/api/companies", async (req, res) => {
  try {
    const company = req.body;
    const newCompany = {
      ...company,
      createdAt: new Date(),
    };
    const result = await companyCollection.insertOne(newCompany);
    res.send(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET companies with filter and query matching
app.get("/api/companies", async (req, res) => {
  try {
    const { recruiterId, search } = req.query;
    const query = {};

    if (recruiterId) {
      query.recruiterId = recruiterId;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { industry: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } }
      ];
    }

    const result = await companyCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Error fetching companies", error });
  }
});

// Ping configuration for direct backend confirmation
app.get("/api/db-ping", async (req, res) => {
  try {
    await client.db("admin").command({ ping: 1 });
    res.json({ success: true, message: "Database connected and pinged successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Application listening natively on port ${port}`);
});

module.exports = app;