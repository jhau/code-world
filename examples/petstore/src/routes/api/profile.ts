import { Router, Response } from "express";
import { check, validationResult } from "express-validator";
import HttpStatusCodes from "http-status-codes";

import auth from "../../middleware/auth";
import Profile, { IProfile } from "../../models/Profile";
import Request from "../../types/Request";

const router: Router = Router();

// @route   GET api/profile/me
// @desc    Get current user's profile
// @access  Private
router.get("/me", auth, async (req: Request, res: Response) => {
  try {
    const profile: IProfile = await Profile.findOne({
      user: req.userId,
    }).populate("user", ["avatar", "email"]);

    if (!profile) {
      return res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json({ errors: [{ msg: "There is no profile for this user" }] });
    }

    res.json(profile);
  } catch (err) {
    console.error(err.message);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).send("Server Error");
  }
});

// @route   POST api/profile
// @desc    Create or update user's profile
// @access  Private
router.post(
  "/",
  [
    auth,
    check("firstName", "First Name is required").notEmpty(),
    check("lastName", "Last Name is required").notEmpty(),
    check("username", "Username is required").notEmpty(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json({ errors: errors.array() });
    }

    const { firstName, lastName, username } = req.body;
    const profileFields = { user: req.userId, firstName, lastName, username };

    try {
      let profile: IProfile = await Profile.findOne({ user: req.userId });

      if (profile) {
        profile = await Profile.findOneAndUpdate(
          { user: req.userId },
          { $set: profileFields },
          { new: true }
        );
      } else {
        profile = new Profile(profileFields);
        await profile.save();
      }

      res.json(profile);
    } catch (err) {
      console.error(err.message);
      res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).send("Server Error");
    }
  }
);

// @route   GET api/profile
// @desc    Get all profiles
// @access  Public
router.get("/", async (_req: Request, res: Response) => {
  try {
    const profiles = await Profile.find().populate("user", ["avatar", "email"]);
    res.json(profiles);
  } catch (err) {
    console.error(err.message);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).send("Server Error");
  }
});

// @route   DELETE api/profile
// @desc    Delete profile and user
// @access  Private
router.delete("/", auth, async (req: Request, res: Response) => {
  try {
    await Profile.findOneAndRemove({ user: req.userId });
    res.json({ msg: "Profile removed" });
  } catch (err) {
    console.error(err.message);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).send("Server Error");
  }
});

export default router;
