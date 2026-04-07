# telegram-webapp

Simple task manager used as a Telegram web application.

## Environment Variables

The application requires several environment variables for both the React client
and Netlify Functions. Copy `.env.example` to `.env` and fill in the values or
configure them in your hosting platform (for example in Netlify via the
`[build.environment]` section of `netlify.toml`).

Required variables:

```
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
REACT_APP_FIREBASE_MEASUREMENT_ID
TELEGRAM_BOT_TOKEN
FIREBASE_CREDENTIALS
```

`FIREBASE_CREDENTIALS` should contain the JSON for a Firebase service account
and `TELEGRAM_BOT_TOKEN` is your Telegram bot token used in `netlify/functions/auth.js`.
