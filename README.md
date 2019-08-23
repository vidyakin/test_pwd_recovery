# Password restoring case
A tiny app where I use Node.js, Express, MongoDB to emulate a process of restoring a user password:
When user initiate a process, system generate a time-limited token to restore only his e-mail.
Then, user goes to the tokenized link and see the new page with 2 fields for a new password and confirm.
When he enter (correctly!) this data, new password will be saved to DB and user become signed in.
