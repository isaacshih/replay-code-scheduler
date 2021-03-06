const passport = require('passport')
const twitchStrategy = require('passport-twitch-strategy').Strategy
require('dotenv').config()


passport.serializeUser(function (user, done) {
    done(null, user)
})

passport.deserializeUser(function (user, done) {
    done(null, user)
})

passport.use(
    new twitchStrategy({
        clientID: process.env.TWITCH_CLIENT_ID,
        clientSecret: process.env.TWITCH_CLIENT_SECRET,
        callbackURL: "https://replaycodescheduler.herokuapp.com/auth/twitch/callback",
        scope: "user_read"
    }, function (accessToken, refreshToken, profile, done) {
        return done(null, profile)
    })
)