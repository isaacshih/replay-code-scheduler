'use strict';

const REVIEWS_PER_DAY = 4
const REVIEW_WAIT_TIME = 14

const express = require('express')
const exphbs = require('express-handlebars')

var app = express()

var hbs = exphbs.create({
    helpers: {
        if_eq: function (a, b, opts) {
            if (a === b) {
                return opts.fn(this)
            } else {
                return opts.inverse(this)
            }
        }
    }
})

app.engine('handlebars', hbs.engine)
app.set('view engine', 'handlebars')

require('dotenv').config()
const { google } = require('googleapis')
const googleSheets = google.sheets({ version: 'v4' });
const googleAuth = require('./config/auth');

const SPREADSHEET_ID = '1AOPhzX6y4Hr69P_JqbJDYjzYmEfwZHxn7J-Vfpdat18'

const passport = require('passport')
const passportConfig = require('./config/passport-config')
const cookieSession = require('cookie-session')
const methodOverride = require('method-override')
const { v4: uuidv4 } = require('uuid')



app.use(express.urlencoded({ extended: false }));

app.use(cookieSession({
    maxAge: 24 * 60 * 60 * 1000,
    keys: [process.env.COOKIE_KEY]
}))

app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))



app.set('port', process.env.PORT || 8081)

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile'] }));

app.get('/auth/google/callback',
    passport.authenticate('google'),
    function (req, res) {
        // Successful authentication, redirect home.
        res.redirect('/');
    });

app.get('/', async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                } else {
                    const dataArray = response.data.values

                    let submissionList = []
                    let scheduleList = []

                    if (dataArray) {
                        for (let i = 0; i < dataArray.length; i++) {

                            while (dataArray[i].length < 9) {
                                dataArray[i].push('')
                            }

                            const submissionItem = {
                                'id': dataArray[i][0],
                                'user_id': dataArray[i][1],
                                'name': dataArray[i][2],
                                'code': dataArray[i][3],
                                'sr': dataArray[i][4],
                                'role': dataArray[i][5],
                                'info': dataArray[i][6],
                                'approved': dataArray[i][7],
                                'completed': dataArray[i][8]
                            }

                            if (!submissionItem.approved) {
                                continue
                            }

                            if (!submissionItem.completed) {
                                submissionList.push(submissionItem)

                                if (!submissionItem.info) {
                                    if (scheduleList.length) {
                                        if (scheduleList[scheduleList.length - 1].submissions.length < REVIEWS_PER_DAY) {
                                            scheduleList[scheduleList.length - 1].submissions.push(submissionItem)
                                        } else {
                                            scheduleList.push({
                                                id: scheduleList.length,
                                                submissions: [submissionItem]
                                            })
                                        }
                                    } else {
                                        scheduleList.push({
                                            id: scheduleList.length,
                                            submissions: [submissionItem]
                                        })
                                    }
                                }
                            }
                        }
                    }
                    var context = {}
                    context.submissionList = submissionList
                    context.scheduleList = scheduleList
                    context.user = req.user
                    context.admin = req.user === process.env.ADMIN_ID
                    res.render('home', context)
                }
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.get('/logout', function (req, res) {
    req.logout()
    res.redirect('/')
})

app.get('/submit', authenticateUser, function (req, res) {
    var context = {}
    context.user = req.user
    context.admin = req.user === process.env.ADMIN_ID
    res.render('submit', context)
})

app.post('/submit', authenticateUser, async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, async function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                const dataArray = response.data.values

                const { name, code, sr, role } = req.body

                const id = uuidv4()
                var info = ''
                if (dataArray) {
                

                    for (let i = 0; i < dataArray.length; i++) {
                        const submissionItem = {
                            'id': dataArray[i][0],
                            'user_id': dataArray[i][1],
                            'name': dataArray[i][2],
                            'code': dataArray[i][3],
                            'sr': dataArray[i][4],
                            'role': dataArray[i][5],
                            'info': dataArray[i][6],
                            'approved': dataArray[i][7],
                            'completed': dataArray[i][8]
                        }
                        if (submissionItem.user_id == req.user && submissionItem.completed) {
                            var d = new Date(submissionItem.completed)
                            d.setDate(d.getDate() + REVIEW_WAIT_TIME)
                            if (d > new Date()) {
                                info = 'WAIT RESTRICTION until ' + d.toDateString().substring(0, 10) + '.'
                            }
                        } else if (submissionItem.user_id == req.user) {
                            info = 'MULTIPLE SUBMISSIONS.'
                        }
                    }
                }

                await googleSheets.spreadsheets.values.append({
                    auth: auth,
                    spreadsheetId: SPREADSHEET_ID,
                    range: "'Sheet1'!A2:J",
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    resource: {
                        values: [[id, req.user, name, code, sr, role, info]]
                    }
                })

                res.redirect('/')
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.get('/admin', authenticateAdmin, async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                const dataArray = response.data.values

                var unapproved = []
                var fullList = []
                for (let i = 0; i < dataArray.length; i++) {
                    while (dataArray[i].length < 10) {
                        dataArray[i].push('')
                    }
                    const submissionItem = {
                        'id': dataArray[i][0],
                        'user_id': dataArray[i][1],
                        'name': dataArray[i][2],
                        'code': dataArray[i][3],
                        'sr': dataArray[i][4],
                        'role': dataArray[i][5],
                        'info': dataArray[i][6],
                        'approved': dataArray[i][7],
                        'completed': dataArray[i][8]
                    }
                    if (!submissionItem.approved) {
                        unapproved.push(submissionItem)
                    }
                    fullList.push(submissionItem)

                }

                var context = {}
                context.submissionList = unapproved
                context.fullList = fullList
                context.user = req.user
                context.admin = req.user === process.env.ADMIN_ID
                res.render('admin', context)
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.post('/admin/:id', authenticateAdmin, async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, async function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                const dataArray = response.data.values
                const id = req.params.id
                const toUpdate = (row) => row[0] === id
                const index = (dataArray.findIndex(toUpdate) + 2)
                const updateRange = 'Sheet1!H' + index

                await googleSheets.spreadsheets.values.update({
                    auth: auth,
                    spreadsheetId: SPREADSHEET_ID,
                    range: updateRange,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [['approved']]
                    }
                })

                res.redirect('/admin')
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.delete('/admin/:id', authenticateAdmin, async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, async function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                const dataArray = response.data.values
                const id = req.params.id
                const toUpdate = (row) => row[0] === id
                const index = (dataArray.findIndex(toUpdate) + 2)

                await googleSheets.spreadsheets.batchUpdate({
                    auth,
                    SPREADSHEET_ID,
                    resource: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: 0,
                                    dimension: 'ROWS',
                                    startIndex: index - 1,
                                    endIndex: index
                                }
                            }
                        }]
                    }
                })

                res.redirect('/admin')
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.post('/admin/complete/:id', authenticateAdmin, async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, async function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                const dataArray = response.data.values
                const id = req.params.id
                const toUpdate = (row) => row[0] === id
                const index = (dataArray.findIndex(toUpdate) + 2)
                const updateRange = 'Sheet1!I' + index

                await googleSheets.spreadsheets.values.update({
                    auth: auth,
                    spreadsheetId: SPREADSHEET_ID,
                    range: updateRange,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [[new Date().toDateString()]]
                    }
                })

                res.redirect('/admin')
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.delete('/admin/delete/:id', authenticateAdmin, async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, async function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                const dataArray = response.data.values
                const id = req.params.id
                const toUpdate = (row) => row[0] === id
                const index = (dataArray.findIndex(toUpdate) + 2)

                await googleSheets.spreadsheets.batchUpdate({
                    auth,
                    SPREADSHEET_ID,
                    resource: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: 0,
                                    dimension: 'ROWS',
                                    startIndex: index - 1,
                                    endIndex: index
                                }
                            }
                        }]
                    }
                })

                res.redirect('/admin')
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.post('/update/:id/:user_id', authenticateAuthorizedUser, async function (req, res) {
    console.log('poop')
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, async function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                const dataArray = response.data.values
                const id = req.params.id
                const { code, sr, role } = req.body
                const toUpdate = (row) => row[0] === id
                const index = (dataArray.findIndex(toUpdate) + 2)
                const updateRange = 'Sheet1!D' + index

                await googleSheets.spreadsheets.values.update({
                    auth: auth,
                    spreadsheetId: SPREADSHEET_ID,
                    range: updateRange,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [[code, sr, role, '']]
                    }
                })

                res.redirect('/')
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.post('/admin', authenticateAdmin, async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, async function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                const dataArray = response.data.values
                let updates = []
                for (let i = 0; i < dataArray.length; i++) {
                    updates.push(['Code Outdated', '', '', 'CODE OUTDATED.', dataArray[i][7], ''])
                }

                await googleSheets.spreadsheets.values.update({
                    auth: auth,
                    spreadsheetId: SPREADSHEET_ID,
                    range: 'Sheet1!D2:J',
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: updates
                    }
                })

                res.redirect('/admin')
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.post('/schedule/complete', authenticateAdmin, async function (req, res) {
    googleAuth.authorize()
        .then((auth) => {
            googleSheets.spreadsheets.values.get({
                auth: auth,
                spreadsheetId: SPREADSHEET_ID,
                range: "'Sheet1'!A2:J",
            }, async function (err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    return console.log(err);
                }
                var dataArray = response.data.values
                let ids = req.body.schedule_items
                if (typeof ids === "string") {
                    const toUpdate = (row) => row[0] === ids
                    const index = (dataArray.findIndex(toUpdate) + 2)
                    var ranges = ['Sheet1!I' + index]
                } else {
                    var ranges = ids.map(function (i) {
                        const toUpdate = (row) => row[0] === i
                        const index = (dataArray.findIndex(toUpdate) + 2)
                        return 'Sheet1!I' + index
                    })
                }


                for (let i = 0; i < ranges.length; i++) {
                    await googleSheets.spreadsheets.values.update({
                        auth: auth,
                        spreadsheetId: SPREADSHEET_ID,
                        range: ranges[i],
                        valueInputOption: 'USER_ENTERED',
                        resource: {
                            values: [[new Date().toDateString()]]
                        }
                    })
                }
                const getRows = await googleSheets.spreadsheets.values.get({
                    auth: auth,
                    spreadsheetId: SPREADSHEET_ID,
                    range: 'Sheet1!A2:J'
                })

                dataArray = getRows.data.values

                let lastReview = new Map()
                ids = []

                for (let i = 0; i < dataArray.length; i++) {
                    const submissionItem = {
                        'id': dataArray[i][0],
                        'user_id': dataArray[i][1],
                        'name': dataArray[i][2],
                        'code': dataArray[i][3],
                        'sr': dataArray[i][4],
                        'role': dataArray[i][5],
                        'info': dataArray[i][6],
                        'approved': dataArray[i][7],
                        'completed': dataArray[i][8]
                    }

                    if (submissionItem.completed) {
                        lastReview.set(submissionItem.user_id, new Date(submissionItem.completed))
                    }

                    if (lastReview.get(submissionItem.user_id) && !submissionItem.completed) {
                        let d1 = lastReview.get(submissionItem.user_id)
                        d1.setDate(d1.getDate() + REVIEW_WAIT_TIME)
                        if (d1 > new Date()) {
                            ids.push(submissionItem.id)
                        }
                    }
                }

                ranges = ids.map(function (i) {
                    const toUpdate = (row) => row[0] === i
                    const index = (dataArray.findIndex(toUpdate) + 2)
                    return 'Sheet1!G' + index
                })

                for (let i = 0; i < ranges.length; i++) {
                    await googleSheets.spreadsheets.values.update({
                        auth: auth,
                        spreadsheetId: SPREADSHEET_ID,
                        range: ranges[i],
                        valueInputOption: 'USER_ENTERED',
                        resource: {
                            values: [['WAIT RESTRICTION until ' + lastReview.get(dataArray[i][1]).toDateString().substring(0, 10) + '.']]
                        }
                    })
                }

                res.redirect('/')
            });
        })
        .catch((err) => {
            console.log('auth error', err);
        });
})

app.use(function (req, res) {
    res.status(404);
    res.render('404');
});

app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.type('plain/text');
    res.status(500);
    res.render('500');
});

app.listen(app.get('port'), function () {
    console.log('Express started on localhost:' + app.get('port') + '; press Ctrl-C to terminate.');
});

function authenticateUser(req, res, next) {
    if (req.user) {
        return next()
    } else {
        res.redirect('/auth/google')
    }
}

function authenticateAuthorizedUser(req, res, next) {
    if (req.user === req.params.user_id || req.user === process.env.ADMIN_ID) {
        return next()
    } else {
        res.redirect('/')
    }
}

function authenticateAdmin(req, res, next) {
    if (req.user === process.env.ADMIN_ID) {
        return next()
    } else {
        res.redirect('/')
    }
}
