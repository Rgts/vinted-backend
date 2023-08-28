require("dotenv").config();
const cors = require("cors");

const express = require("express");

const mongoose = require("mongoose");
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
const isAuthenticated = require("./middlewares/isAuthenticated");
const User = require("./models/User");
const Offer = require("./models/Offer");

// Cloudinary config (see dashboard)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

mongoose.connect(process.env.MONGODB_URI);
// For dev only
// mongoose.connect("mongodb://localhost/vinted");

const SHA256 = require("crypto-js/sha256");
const encBase64 = require("crypto-js/enc-base64");
const uid2 = require("uid2");

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.json("Hello vinted app");
});

// Route signup
app.post("/user/signup", async (req, res) => {
  console.log("=>Hey I'm in the signup route");
  console.log("req.body=>" + req.body);
  // Ex de requete
  // {
  //   "username": "JohnDoe",
  //   "email": "johndoe@lereacteur.io",
  //   "password": "azerty",
  //   "newsletter": true
  // }

  try {
    //Check if username given
    if (!req.body.username) {
      return res.status(400).json("Username is mandatory.");
    }

    // Check if email already exist
    foundUsers = await User.find({ email: req.body.email });
    if (foundUsers.length !== 0) {
      return res
        .status(400)
        .json({ message: `User ${foundUsers[0].email} already exist` });
    }

    // Retrieve user inputs in body
    const password = req.body.password;
    const token = uid2(16);
    const salt = uid2(16);
    const saltedPassword = req.body.password + salt;
    const hash = SHA256(saltedPassword).toString(encBase64);

    // Create a user using User database model
    const newUser = new User({
      email: req.body.email,
      account: {
        username: req.body.username,
        avatar: {}, // upload image not handled yet
      },
      newsletter: req.body.newsletter,
      token: token,
      hash: hash,
      salt: salt,
    });

    await newUser.save();
    // Exempel :
    //   {
    //   "_id": "5b4cdf774f53952a5f849635",
    //   "token": "bmaDNrycfhCkmXYKRdRUrzSkUAW-8LuxfdUyfStVNFS1fklp1t17nBkZrRdSNh7W",
    //   "account": {
    //     "username": "JohnDoe",
    //   }:
    // }
    return res.status(200).json({
      _id: newUser._id,
      token: newUser.token,
      account: {
        username: newUser.account.username,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Login route
app.post("/user/login", async (req, res) => {
  console.log("hello i'm in login route");
  console.log("body : " + req.body);

  try {
    // Retrieve user
    console.log("=>searching  user=>");

    const foundUser = await User.findOne({
      email: req.body.email,
    });
    console.log("foundUser=>" + foundUser);

    // Retrieve pwd, apply salt and hash, and compare it to db hash
    const isAllowed =
      SHA256(req.body.password + foundUser.salt).toString(encBase64) ===
      foundUser.hash;
    console.log(isAllowed);

    return res.status(200).json({
      _id: foundUser._id,
      token: foundUser.token,
      account: {
        username: foundUser.account.username,
      },
    });
  } catch (error) {
    return res.status(400).json(error.message);
  }
});

// Function to convert upload file data to base64
const convertToBase64 = (file) => {
  console.log("=>currently trying to convert file to base 64");
  return `data:${file.mimetype};base64,${file.data.toString("base64")}`;
};

// Route publish offer
app.post("/offer/publish", isAuthenticated, fileUpload(), async (req, res) => {
  try {
    const convertedFile = convertToBase64(req.files.picture);
    const result = await cloudinary.uploader.upload(convertedFile);

    const newOffer = new Offer({
      product_name: req.body.title,
      product_description: req.body.description,
      product_price: req.body.price,
      product_details: [
        {
          MARQUE: req.body.brand,
        },
        {
          TAILLE: req.body.size,
        },
        {
          ÉTAT: req.body.condition,
        },
        {
          COULEUR: req.body.color,
        },
        {
          EMPLACEMENT: req.body.city,
        },
      ],
      product_image: { secure_url: result.secure_url },
      owner: req.user,
    });

    await newOffer.save();

    return res.status(200).json({ newOffer });
  } catch (error) {
    res.status(500).json(error.message);
  }
});

// Route to get offers with filters
app.get("/offers", async (req, res) => {
  try {
    // Default limit set to 5 offers per page :
    const limit = 5;
    // Default page is page 1
    let page = 1;

    if (req.query.page) {
      page = req.query.page;
    }

    // Filter is set to empty, then keys are added if specified in query
    const filters = {};

    // Key product_name
    if (req.query.title) {
      filters.product_name = new RegExp(req.query.title, "i");
    }

    // Key product_price
    if (req.query.priceMin) {
      filters.product_price = { $gte: req.query.priceMin };
    }
    if (req.query.priceMax) {
      // If product_price key exists we don't create it
      if (filters.product_price) {
        filters.product_price.$lte = req.query.priceMax;
      } else {
        // Else we create it
        filters.product_price = { $lte: req.query.priceMax };
      }
    }

    const sortObject = {};
    // Key sort
    if (req.query.sort === "price-asc") {
      sortObject.product_price = "asc";
    } else if (req.query.sort === "price-desc") {
      sortObject.product_price = "desc";
    }

    const offers = await Offer.find(filters)
      .populate({
        path: "owner",
        select: "account",
      })
      .sort(sortObject)
      .limit(limit)
      .skip((page - 1) * limit);

    const count = await Offer.countDocuments(filters);

    return res.status(200).json({ count: count, offers: offers });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.all("*", (req, res) => {
  res.status(400).json("Route not found");
});

// On prod mode
const PORT = process.env.PORT;
// On dev mode
// PORT=3000

app.listen(PORT, () => {
  console.log("Serveur Vinted online on PORT => ", PORT);
});
