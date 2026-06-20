const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("TaskForge server is running");
});

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("taskforge_db");
    const taskCollection = database.collection("tasks");
    const userCollection = database.collection("user");
    const proposalCollection = database.collection("proposals");

    // API creation for tasks

    app.post("/api/proposals", async (req, res) => {
      const proposal = req.body;

      const newProposal = {
        ...proposal,
        status: "pending",
        createdAt: new Date(),
      };

      const result = await proposalCollection.insertOne(newProposal);
      res.send(result);
    });

    app.get("/api/freelancers", async (req, res) => {
      const cursor = userCollection.find({
        role: "freelancer",
      });

      const results = await cursor.toArray();
      res.send(results);
    });

    app.get("/api/tasks/:id", async (req, res) => {
      const { ObjectId } = require("mongodb");

      try {
        const task = await taskCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        res.send(task);
      } catch (error) {
        res.status(400).send({ message: "Invalid task id" });
      }
    });

    app.get("/api/tasks", async (req, res) => {
      const query = {};
      if (req.query.taskId) {
        query._id = req.query.taskId;
      }
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = taskCollection.find(query);
      const results = await cursor.toArray();
      res.send(results);
    });

    app.post("/api/tasks", async (req, res) => {
      const task = req.body;
      const newTask = {
        ...task,
        createdAt: new Date(),
      };
      const result = await taskCollection.insertOne(newTask);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`TaskForge server running on port ${port}`);
});
