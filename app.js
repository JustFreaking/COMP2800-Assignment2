require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const session = require('express-session');
const Joi = require('joi');
const bcrypt = require('bcrypt');

const app = express();

const PORT = process.env.PORT || 3000;

const node_session_secret = 'ba1539a7-819e-4499-ae25-ae83d89f5f76';

const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    userType: { type: String, default: 'user' }
});

const User = mongoose.model('User', userSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: node_session_secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`
    }),
    cookie: { maxAge: 3600000 }
}));

app.set('view engine', 'ejs');

mongoose.connect(`mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

app.get('/', (req, res) => {
    if (req.session.user) {
        res.render('index', { user: req.session.user });
    } else {
        res.render('index', { user: null });
    }
});


app.get('/signup', (req, res) => {
    res.render('signup');
});




app.post('/signupSubmit', (req, res) => {
    const { username, email, password } = req.body;

    if (!username) {
        return res.send(`
            <p>Username is required.</p>
            <a href="/signup">Go back to Sign Up</a>
        `);
    }

    if (!email) {
        return res.send(`
            <p>Email is required.</p>
            <a href="/signup">Go back to Sign Up</a>
        `);
    }

    if (!password) {
        return res.send(`
            <p>Password is required.</p>
            <a href="/signup">Go back to Sign Up</a>
        `);
    }

    const schema = Joi.object({
        username: Joi.string().min(3),
        email: Joi.string().email(),
        password: Joi.string().min(6)
    });

    const { error } = schema.validate({ username, email, password });

    if (error) {
        return res.send(`
            <p>Validation error: ${error.details[0].message}</p>
            <a href="/signup">Go back to Sign Up</a>
        `);
    }

    bcrypt.hash(password, 10, async (err, hashedPassword) => {
        if (err) {
            return res.send('Error hashing password.');
        }

        try {
            const newUser = new User({
                username: username,
                email: email,
                password: hashedPassword
            });

            await newUser.save();

            req.session.user = { username: user.username, email: user.email, userType: user.userType };
            res.redirect('/members');

        } catch (dbError) {
            res.send(`
            <p>Database error: ${dbError.message}</p>
            <a href="/signup">Go back to Sign Up</a>
        `);
        }
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/loginSubmit', async (req, res) => {
    const { email, password } = req.body;

    if (!email) {
        return res.send(`
            <p>Email is required.</p>
            <a href="/login">Go back to Log In</a>
        `);
    }
    if (!password) {
        return res.send(`
            <p>Password is required.</p>
            <a href="/login">Go back to Log In</a>
        `);
    }

    const schema = Joi.object({
        email: Joi.string().email(),
        password: Joi.string().min(6)
    });

    const { error } = schema.validate({ email, password });

    if (error) {
        return res.send(`
            <p>Validation error: ${error.details[0].message}</p>
            <a href="/login">Go back to Log In</a>
        `);
    }

    const user = await User.findOne({ email: email });
    if (!user) {
        return res.send(`
            <p>User not found.</p>
            <a href="/login">Go back to Log In</a>
        `);
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        return res.send(`
            <p>Invalid password.</p>
            <a href="/login">Go back to Log In</a>
        `);
    }


    req.session.user = { username: user.username, email: user.email, userType: user.userType };

    res.redirect('/members');
});

app.get('/members', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const username = req.session.user.username;
    const images = ['image1.jpg', 'image2.jpg', 'image3.jpg'];

    res.render('members', { username: username, images: images });
});



app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.send('Error logging out.');
        }
        res.redirect('/');
    });
});

app.get('/admin', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Redirect to login if no user is logged in
    }

    const user = await User.findOne({ email: req.session.user.email });

    if (!user) {
        return res.redirect('/login'); // Redirect if the user does not exist
    }

    const isAdmin = user.userType === 'admin'; // Check if the user is an admin

    try {
        const users = isAdmin ? await User.find({}, 'username email userType') : []; // Fetch users only if admin
        res.render('admin', { isAdmin, users, user: req.session.user });
    } catch (err) {
        res.status(500).send('Error retrieving users.');
    }
});

app.post('/admin/promote/:email', async (req, res) => {
    try {
        const userToPromote = await User.findOne({ email: req.params.email });
        if (!userToPromote) {
            return res.status(404).send('User not found.');
        }

        userToPromote.userType = 'admin';
        await userToPromote.save();

        res.redirect('/admin');
    } catch (err) {
        res.status(500).send('Error promoting user.');
    }
});

app.post('/admin/demote/:email', async (req, res) => {
    try {
        const userToDemote = await User.findOne({ email: req.params.email });
        if (!userToDemote) {
            return res.status(404).send('User not found.');
        }

        userToDemote.userType = 'user';
        await userToDemote.save();

        res.redirect('/admin');
    } catch (err) {
        res.status(500).send('Error demoting user.');
    }
});

app.use((req, res) => {
    res.render('404');
});



app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});