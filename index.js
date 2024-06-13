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
    origin: ["http://localhost:5173", "http://localhost:5174"],
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
    const announcementCollection = client.db("ConvoHub").collection("announcement");
    const paymentCollection = client.db("ConvoHub").collection("payment");

    // jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ASSESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      // res.send({token})
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // const verifyToken = (req, res, next) => {
    //   console.log("inside verify token", req.headers.authorization);
    //   if (!req.headers.authorization) {
    //     return res.status(401).send({ message: "unauthorize access" });
    //   }
    //   const token = req.headers.authorization.split(" ")[1];
    //   jwt.verify(token, process.env.ASSESS_TOKEN_SECRET, (err, decoded) => {
    //     if (err) {
    //       return res.status(401).send({ message: "unauthorize access" });
    //     }
    //     req.decoded = decoded;
    //     next();
    //   });
    // };

    const verifyToken = async (req, res, next) => {
      const token = req.cookies?.token;
      console.log(token);
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          console.log(err);
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.user = decoded;
        next();
      });
    };

    // verify admin middleWare
    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await userCollection.findOne(query);
      if (!result || result?.role !== "Admin") {
        return res.status(401).send({ message: "forbidden access" });
      }

      next();
    };

   


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
    app.get("/users",  async (req, res) => {
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

    // all rooms from DB
    app.get("/posts", async (req, res) => {
      const result = await allPostCollection.find().toArray();
      res.send(result);
    });

    // get single post from db using id
    app.get("/post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allPostCollection.findOne(query);
      res.send(result);
    });

    // add post on db
    app.post("/post", async (req, res) => {
      const roomData = req.body;
      const result = await allPostCollection.insertOne(roomData);
      res.send(result);
    });

    // get post from user

    app.get("/mypost/:email", async (req, res) => {
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

    app.post("/announcement", async (req, res) => {
      const announceData = req.body;
      const result = await announcementCollection.insertOne(announceData);
      res.send(result);
    });

    // get all announcement from db
    app.get('/announcements', async (req, res) => {
      const result = await announcementCollection.find().toArray()
      res.send(result)

    })

    
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
    app.post("/payment", async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);
      res.send(result);
    });



    app.patch('/user/status/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const updateDoc = {
        
        $set:{badges: "Gold"}
      }
 
      const result = await userCollection.updateOne(query, updateDoc)
      res.send(result)
      
    })


    

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
