const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const database = client.db("taskforge_db");
const taskCollection = database.collection("tasks");
const userCollection = database.collection("user");
const proposalCollection = database.collection("proposals");

app.get("/", (req, res) => {
  res.send("TaskForge server is running");
});

app.get("/api/tasks", async (req, res) => {
  const query = {};

  if (req.query.status) {
    query.status = req.query.status;
  }

  const result = await taskCollection.find(query).toArray();
  res.send(result);
});

app.get("/api/tasks/:id", async (req, res) => {
  try {
    const task = await taskCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    res.send(task);
  } catch (error) {
    res.status(400).send({ message: "Invalid task id" });
  }
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

app.get("/api/freelancers", async (req, res) => {
  const result = await userCollection.find({ role: "freelancer" }).toArray();

  res.send(result);
});

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

app.get("/api/proposals", async (req, res) => {
  const query = {};

  if (req.query.clientEmail) {
    query.clientEmail = req.query.clientEmail;
  }

  if (req.query.freelancerEmail) {
    query.freelancerEmail = req.query.freelancerEmail;
  }

  const result = await proposalCollection.find(query).toArray();
  res.send(result);
});

app.listen(port, () => {
  console.log(`TaskForge server running on port ${port}`);
});
