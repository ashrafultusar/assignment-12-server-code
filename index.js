const express = require("express");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://assignment-12-8db85.firebaseapp.com",
      "https://assignment-12-8db85.web.app",
    ],
    credentials: true,
  })
);
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hzcboi3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const allPostCollection = client.db("ConvoHub").collection("allPost");
    const userCollection = client.db("ConvoHub").collection("users");
    const announcementCollection = client
      .db("ConvoHub")
      .collection("announcement");
    const paymentCollection = client.db("ConvoHub").collection("payment");
    const commentCollection = client.db("ConvoHub").collection("comments");
    const tagCollection = client.db("ConvoHub").collection("tag");
    const upVoteCollection = client.db("ConvoHub").collection("upvote");
    const downvoteCollection = client.db("ConvoHub").collection("downvote");
    const reportCollection = client.db("ConvoHub").collection("report");

   
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ASSESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyToken = async (req, res, next) => {
      console.log(req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({message: 'forbidden access'})
      }
      const token = req.headers.authorization.split(' ')[1];
      
      jwt.verify(token, process.env.ASSESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({message: 'forbidden-access'})
        }
        req.decoded = decoded;
        next()
      })

    };

    // verify admin middleWare
    // const verifyAdmin = async (req, res, next) => {
    //   const user = req.user;
    //   const query = { email: user?.email };
    //   const result = await userCollection.findOne(query);
    //   if (!result || result?.role !== "Admin") {
    //     return res.status(401).send({ message: "forbidden access" });
    //   }

    //   next();
    // };

    // save user data in db
    app.put("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      // check user already exist in db
      const isExist = await userCollection.findOne(query);

      if (isExist) {
        if (user.status === "Requested") {
          const result = await userCollection.updateOne(query, {
            $set: { status: user?.status },
          });
          return res.send(result);
        } else {
          return res.send(isExist);
        }
      }

      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // get a user info by email from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send(result);
    });

    // get all user on db and show admin ui
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // update user role
    app.patch("/user/update/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // all posts get from DB
    app.get("/posts", async (req, res) => {
      const search = req.query;
      const query = {
        tag: {
          $regex: search.search,
          $options: "i",
        },
      };

      const result = await allPostCollection
        .find(query)
        .sort({ post_time: -1 })
        .toArray();
      res.send(result);
    });

    // get single post from db using id
    app.get("/post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allPostCollection.findOne(query);
      res.send(result);
    });

    app.get("/comments/:postId", async (req, res) => {
      try {
        const comments = await Comment.find({ postId: req.params.postId });
        res.json(comments);
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // add post on db
    app.post("/post", async (req, res) => {
      const email = req.body.email;
      const roomData = req.body;
      try {
        // Fetch the user to check their badge status
        const user = await userCollection.findOne({ email: email });
        console.log(user);
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        if (user.badges === "bronze") {
          // Check the post count for the normal user
          const postCount = await allPostCollection.countDocuments({
            email: email,
          });
          console.log(postCount, "post count");
          if (postCount > 5) {
            return res.send({
              message:
                "You have reached the limit of 5 posts. Become a member to add more posts.",
              redirectToMembership: true,
            });
          }
        }

        // If the user is premium or has not exceeded the post limit, insert the new post
        const result = await allPostCollection.insertOne(roomData);
        res.send(result);
      } catch (error) {
        console.error("Error adding post:", error);
        res.status(500).send({ message: " Error" });
      }
    });

    // get post from user
    app.get("/mypost/:email",verifyToken, async (req, res) => {
      const email = req.params.email;
      let query = { email: email };
      const result = await allPostCollection.find(query).toArray();
      res.send(result);
    });

    // delete room from user ui
    app.delete("/post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allPostCollection.deleteOne(query);
      res.send(result);
    });

    // upload announcement
    app.post("/announcement", async (req, res) => {
      const announceData = req.body;
      const result = await announcementCollection.insertOne(announceData);
      res.send(result);
    });

    // added tag on admin
    app.post("/tag", async (req, res) => {
      const announceData = req.body;
      const result = await tagCollection.insertOne(announceData);
      res.send(result);
    });

    // get all tag
    app.get("/tags", async (req, res) => {
      const result = await tagCollection.find().toArray();
      res.send(result);
    });

    // get all announcement from db
    app.get("/announcements", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });

    // upload comment
    app.post("/comment",verifyToken, async (req, res) => {
      try {
        const commentData = req.body;
        await commentCollection.insertOne(commentData);

        // Fetch all comments for the given postId
        const comments = await commentCollection
          .find({ postId: commentData.postId })
          .toArray();

        res.send(comments);
      } catch (err) {
        console.error("Failed to insert comment", err);
        res.status(500).send({ error: "Failed to insert comment" });
      }
    });

    // comment load
    app.get("/comments", async (req, res) => {
      const postId = req.query.postId;
      const result = await commentCollection.find({ postId: postId }).toArray();
      res.send(result);
    });

    // get all coment
    app.get("/allcoment", async (req, res) => {
      const result = await commentCollection.find().toArray();
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;

      if (!price || priceInCent < 1) return;

      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",

        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({ clientSecret: client_secret });
    });

    // payment
    app.post("/payment",verifyToken, async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);
      res.send(result);
    });

    app.patch("/user/status/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const updateDoc = {
        $set: { badges: "Gold" },
      };

      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // admin profile statistic
    app.get("/admin-stats",verifyToken, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();

      const posts = await allPostCollection.estimatedDocumentCount();
      const comment = await commentCollection.estimatedDocumentCount();

      res.send({
        users,
        posts,
        comment,
      });
    });

    // upvote post
    app.post("/upvote", async (req, res) => {
      const upvote = req.body;
      const result = await upVoteCollection.insertOne(upvote);
      res.send(result);
    });
    // upvote get on ui
    app.get("/upvotes", async (req, res) => {
      const postId = req.query.postId;
      const result = await upVoteCollection.find({ postId: postId }).toArray();
      res.send(result);
    });

    // downvote post
    app.post("/downvote", async (req, res) => {
      const downvote = req.body;
      const result = await downvoteCollection.insertOne(downvote);
      res.send(result);
    });

    // down vote get
    app.get("/downvotes", async (req, res) => {
      const postId = req.query.postId;
      const result = await downvoteCollection
        .find({ postId: postId })
        .toArray();
      res.send(result);
    });

    // report comment post
    app.post("/report", async (req, res) => {
      const reportData = req.body;
      const result = await reportCollection.insertOne(reportData);
      res.send(result);
    });

    // repoet comment get
    app.get("/reports", async (req, res) => {
      const result = await reportCollection.find().toArray();
      res.send(result);
    });

    //comment delete
    

    app.delete("/report/:reportId", async (req, res) => {
      const reportId = req.params.reportId;
      const { commentId } = req.body;

      try {
        const reportQuery = { _id: new ObjectId(reportId) };
        const commentQuery = { _id: new ObjectId(commentId) };

        // Delete the report
        const reportResult = await reportCollection.deleteOne(reportQuery);

        // Delete the comment
        const commentResult = await commentCollection.deleteOne(commentQuery);

        if (
          reportResult.deletedCount === 1 &&
          commentResult.deletedCount === 1
        ) {
          res.status(200).send({
            message: "Report and associated comment successfully deleted.",
          });
        } else {
          res.status(404).send({ message: "Report or comment not found." });
        }
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to delete report or comment.", error });
      }
    });

    // Connect the client to the server	(optional starting in v4.7)

    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("ConvoHub is running");
});

app.listen(port, () => {
  console.log(`ConvoHub is running on port ${port}`);
});
