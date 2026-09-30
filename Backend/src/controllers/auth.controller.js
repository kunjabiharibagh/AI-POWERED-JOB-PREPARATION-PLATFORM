const userModel = require("../models/user.model")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.model")

/**
 * Shared cookie options (used for set and clear so they always match).
 * Local dev: secure=false, sameSite=lax
 * Production (Vercel frontend + separate backend): secure=true, sameSite=none
 */
const isProd = process.env.NODE_ENV === "production"

const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
}

// clearCookie must not receive maxAge
const clearCookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
}

function createToken(user) {
    return jwt.sign(
        { id: user._id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    )
}

/**
 * @name registerUserController
 * @description register a new user, expects username, email and password in the request body
 * @access Public
 */
async function registerUserController(req, res) {
    try {
        const { username, email, password } = req.body

        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Please provide username, email and password"
            })
        }

        const isUserAlreadyExists = await userModel.findOne({
            $or: [ { username }, { email } ]
        })

        if (isUserAlreadyExists) {
            return res.status(400).json({
                message: "Account already exists with this email address or username"
            })
        }

        const hash = await bcrypt.hash(password, 10)

        const user = await userModel.create({
            username,
            email,
            password: hash
        })

        const token = createToken(user)
        res.cookie("token", token, cookieOptions)

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        })
    } catch (err) {
        console.log("REGISTER ERROR:", err)
        res.status(500).json({ message: err.message })
    }
}


/**
 * @name loginUserController
 * @description login a user, expects email and password in the request body
 * @access Public
 */
async function loginUserController(req, res) {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({
                message: "Please provide email and password"
            })
        }

        const user = await userModel.findOne({ email })

        if (!user) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const isPasswordValid = await bcrypt.compare(password, user.password)

        if (!isPasswordValid) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const token = createToken(user)
        res.cookie("token", token, cookieOptions)

        res.status(200).json({
            message: "User loggedIn successfully.",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        })
    } catch (err) {
        console.log("LOGIN ERROR:", err)
        res.status(500).json({ message: err.message })
    }
}


/**
 * @name logoutUserController
 * @description clear token from user cookie and add the token in blacklist
 * @access public
 */
async function logoutUserController(req, res) {
    try {
        const token = req.cookies?.token

        if (token) {
            await tokenBlacklistModel.create({ token })
        }

        res.clearCookie("token", clearCookieOptions)

        res.status(200).json({
            message: "User logged out successfully"
        })
    } catch (err) {
        console.log("LOGOUT ERROR:", err)
        res.status(500).json({ message: err.message })
    }
}

/**
 * @name getMeController
 * @description get the current logged in user details.
 * @access private
 */
async function getMeController(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Not authenticated" })
        }

        const user = await userModel.findById(req.user.id)

        if (!user) {
            return res.status(404).json({ message: "User not found" })
        }

        res.status(200).json({
            message: "User details fetched successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        })
    } catch (err) {
        console.log("GET-ME ERROR:", err)
        res.status(500).json({ message: err.message })
    }
}


module.exports = {
    registerUserController,
    loginUserController,
    logoutUserController,
    getMeController
}