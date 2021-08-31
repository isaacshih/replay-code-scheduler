# replay-code-scheduler

Currently deployed on https://replaycodescheduler.herokuapp.com

Log in with your Twitch account  
Submit Overwatch replay codes to be reviewed

There is an admin panel where you can 
- Accept, complete, and delete submissions
- Wipe all replay codes in the case of an Overwatch patch

Submissions and schedule are listed for users to see without logging in
- Only accepted, uncompleted submissions are visible
- Users can update their own codes from these lists

Schedule is generated automatically based on
- Weekly schedule (set which weekdays to perform reviews)
- Reviews per day

Reviews are excluded from the schedule for any of the following reasons:
- If there has been a recent patch and no updated code has been provided
- If the user has recieved a review within the last 14 days
- If the user has multiple submissions, only one will be eligible
