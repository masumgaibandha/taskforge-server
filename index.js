const express = require("express");
const cors = require("cors");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
const paymentCollection = database.collection("payments");

app.get("/", (req, res) => {
  res.send("TaskForge server is running");
});

// Stripe checkout
app.post("/api/create-checkout-session", async (req, res) => {
  const { proposalId } = req.body;

  try {
    const proposal = await proposalCollection.findOne({
      _id: new ObjectId(proposalId),
    });

    if (!proposal) {
      return res.status(404).send({ message: "Proposal not found" });
    }

    if (proposal.status !== "pending") {
      return res.status(400).send({
        message: "This proposal is no longer available for payment.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: proposal.taskTitle,
              description: `Freelancer: ${proposal.freelancerName}`,
            },
            unit_amount: Number(proposal.bidAmount) * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        proposalId: proposal._id.toString(),
        taskId: proposal.taskId,
        clientEmail: proposal.clientEmail,
        freelancerEmail: proposal.freelancerEmail,
      },
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard/client/proposals`,
    });

    res.send({ url: session.url });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Failed to create checkout session" });
  }
});

app.post("/api/confirm-payment", async (req, res) => {
  const { sessionId } = req.body;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).send({
        message: "Payment not completed",
      });
    }

    const proposalId = session.metadata.proposalId;
    const taskId = session.metadata.taskId;

    await proposalCollection.updateOne(
      { _id: new ObjectId(proposalId) },
      {
        $set: {
          status: "accepted",
          updatedAt: new Date(),
        },
      },
    );

    await taskCollection.updateOne(
      { _id: new ObjectId(taskId) },
      {
        $set: {
          status: "in-progress",
          updatedAt: new Date(),
        },
      },
    );

    const existingPayment = await paymentCollection.findOne({ sessionId });

    if (!existingPayment) {
      await paymentCollection.insertOne({
        sessionId,
        proposalId,
        taskId,
        clientEmail: session.metadata.clientEmail,
        freelancerEmail: session.metadata.freelancerEmail,
        amount: session.amount_total / 100,
        currency: session.currency,
        paymentStatus: session.payment_status,
        createdAt: new Date(),
      });
    }

    res.send({ success: true });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Payment verification failed",
    });
  }
});

// Users
app.get("/api/users/:email", async (req, res) => {
  const user = await userCollection.findOne({ email: req.params.email });
  res.send(user);
});

app.patch("/api/users/:email", async (req, res) => {
  const updatedUser = req.body;

  const result = await userCollection.updateOne(
    { email: req.params.email },
    {
      $set: {
        name: updatedUser.name,
        image: updatedUser.image,
        phone: updatedUser.phone,
        location: updatedUser.location,
        website: updatedUser.website,
        bio: updatedUser.bio,
        updatedAt: new Date(),
      },
    },
  );

  res.send(result);
});

// Tasks
app.get("/api/tasks", async (req, res) => {
  const query = {};

  if (req.query.status) {
    query.status = req.query.status;
  }

  if (req.query.clientEmail) {
    query.clientEmail = req.query.clientEmail;
  }

  if (req.query.category && req.query.category !== "All Categories") {
    query.category = req.query.category;
  }

  if (req.query.search) {
    query.title = {
      $regex: req.query.search,
      $options: "i",
    };
  }

  const result = await taskCollection
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();

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
    status: task.status || "open",
    proposalCount: task.proposalCount || 0,
    createdAt: new Date(),
  };

  const result = await taskCollection.insertOne(newTask);
  res.send(result);
});

app.patch("/api/tasks/:id", async (req, res) => {
  const updatedTask = req.body;

  const result = await taskCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        ...updatedTask,
        updatedAt: new Date(),
      },
    },
  );

  res.send(result);
});

app.delete("/api/tasks/:id", async (req, res) => {
  const result = await taskCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});

// Freelancers
app.get("/api/freelancers", async (req, res) => {
  const result = await userCollection.find({ role: "freelancer" }).toArray();
  res.send(result);
});

// Proposals
app.get("/api/proposals", async (req, res) => {
  const query = {};

  if (req.query.clientEmail) query.clientEmail = req.query.clientEmail;
  if (req.query.freelancerEmail) {
    query.freelancerEmail = req.query.freelancerEmail;
  }

  const result = await proposalCollection.find(query).toArray();
  res.send(result);
});

app.post("/api/proposals", async (req, res) => {
  const proposal = req.body;

  const alreadySubmitted = await proposalCollection.findOne({
    taskId: proposal.taskId,
    freelancerEmail: proposal.freelancerEmail,
  });

  if (alreadySubmitted) {
    return res.status(409).send({
      message: "You already submitted a proposal for this task.",
    });
  }

  const newProposal = {
    ...proposal,
    status: "pending",
    createdAt: new Date(),
  };

  const result = await proposalCollection.insertOne(newProposal);

  await taskCollection.updateOne(
    { _id: new ObjectId(proposal.taskId) },
    {
      $inc: {
        proposalCount: 1,
      },
    },
  );

  res.send(result);
});

app.patch("/api/proposals/:id", async (req, res) => {
  const { status } = req.body;

  const result = await proposalCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    },
  );

  res.send(result);
});

// Payments
app.get("/api/payments", async (req, res) => {
  const query = {};

  if (req.query.clientEmail) {
    query.clientEmail = req.query.clientEmail;
  }

  if (req.query.freelancerEmail) {
    query.freelancerEmail = req.query.freelancerEmail;
  }

  const result = await paymentCollection.find(query).toArray();

  res.send(result);
});

// Admin overview
app.get("/api/admin/stats", async (req, res) => {
  const totalUsers = await userCollection.countDocuments();
  const totalTasks = await taskCollection.countDocuments();
  const activeTasks = await taskCollection.countDocuments({
    status: "in-progress",
  });

  const payments = await paymentCollection.find().toArray();
  const totalRevenue = payments.reduce(
    (total, payment) => total + Number(payment.amount || 0),
    0,
  );

  res.send({
    totalUsers,
    totalTasks,
    activeTasks,
    totalRevenue,
  });
});

// Admin manage users
app.get("/api/admin/users", async (req, res) => {
  const users = await userCollection.find().toArray();
  res.send(users);
});

app.patch("/api/admin/users/:id/block", async (req, res) => {
  const result = await userCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        isBlocked: true,
        updatedAt: new Date(),
      },
    },
  );

  res.send(result);
});

app.patch("/api/admin/users/:id/unblock", async (req, res) => {
  const result = await userCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        isBlocked: false,
        updatedAt: new Date(),
      },
    },
  );

  res.send(result);
});

// Admin manage tasks
app.get("/api/admin/tasks", async (req, res) => {
  const tasks = await taskCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(tasks);
});

// Admin transactions
app.get("/api/admin/transactions", async (req, res) => {
  const transactions = await paymentCollection
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  res.send(transactions);
});

app.listen(port, () => {
  console.log(`TaskForge server running on port ${port}`);
});
