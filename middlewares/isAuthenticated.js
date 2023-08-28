const User = require("../models/User");

const isAuthenticated = async (req, res, next) => {
  try {
    if (req.headers.authorization) {
      const receivedToken = req.headers.authorization.replace("Bearer ", "");
      // console.log(receivedToken); //s6tWy3DkBp7SPFsl
      const owner = await User.findOne({ token: receivedToken }).select(
        "account"
      );
      if (owner) {
        console.log(Object.keys(req));
        req.user = owner;
        return next();
      } else {
        return res.status(401).json("Unauthorized");
      }
    } else {
      return res.status(401).json("Unauthorized");
    }
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

module.exports = isAuthenticated;
