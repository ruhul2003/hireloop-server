const express = require('express');
const app = express();
const port = 5000;
const cors = require('cors');
require('dotenv').config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI;

app.get('/', (req, res) => {
  res.send('Hello World!');
});



const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();


    const database = client.db("hireloop_db");
    const jobCollection = database.collection("jobs");
    const companyCollection = database.collection("companies");


 // GET jobs
app.get('/api/jobs', async (req, res) => {
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
        
        res.json(result);           // ← Better to use res.json()
    } catch (error) {
        console.error("Error fetching jobs:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST job
app.post('/api/jobs', async (req, res) => {
    try {
        const job = req.body;

        const newJob ={
          ...job,
          createdAt: new Date()
        }
        
        // === IMPORTANT DEBUG LOG ===
        console.log("=== JOB PAYLOAD RECEIVED ===");
        console.log(JSON.stringify(job, null, 2));

        if (!job.companyId) {
            return res.status(400).json({ 
                success: false, 
                message: "companyId is required to post a job" 
            });
        }

        const result = await jobCollection.insertOne(newJob);
        
        res.json({ 
            success: true, 
            insertedId: result.insertedId 
        });
    } catch (error) {
        console.error("Error posting job:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = {
                _id: new ObjectId(id)
            }
            const result = await jobCollection.findOne(query);
            res.send(result);
            console.log(result);
        })


     //Company related apis

     app.post('/api/companies', async (req, res) => {
       const company = req.body;
       const newCompany = {
         ...company,
         createdAt: new Date()
       }
       const result = await companyCollection.insertOne(newCompany);
       res.send(result);
     });

     app.get('/api/my/companies', async (req, res) => {
        const query = {};
        if(req.query.recruiterId){
          query.recruiterId = req.query.recruiterId;
        }
        const result = await companyCollection.findOne(query);
        res.send(result);
     });


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
   
  }
}
run().catch(console.dir);



app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});