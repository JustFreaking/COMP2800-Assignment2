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
    password: String
});

const User = mongoose.model('User', userSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));


app.use(session({
    secret: node_session_secret,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
        mongoUrl: `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`
    }),
    cookie: { maxAge: 3600000 }
}));

mongoose.connect(`mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));


app.get('/', (req, res) => {
    if (req.session.user) {
        res.send(`
            <p>Hello ${req.session.user.username}!</p>

            <form method="GET" action="/members">
                <button type="submit">Go to Members Area</button>
            </form>

            <form method="GET" action="/logout">
                <button type="submit">Logout</button>
            </form>
        `);
    } else {
        res.send(`
            <form method="GET" action="/signup">
                <button type="submit">Sign Up</button>
            </form>

            <form method="GET" action="/login">
                <button type="submit">Log in</button>
            </form>
        `);
    }
});

app.get('/signup', (req, res) => {
    res.send(`
        <form method="POST" action="/signupSubmit">
            <input type="text" name="username" placeholder="Username">
            <input type="email" name="email" placeholder="Email">
            <input type="password" name="password" placeholder="Password">
            <button type="submit">Sign Up</button>
        </form>
    `);
});


app.post('/signupSubmit', (req, res) => {
    const { username, email, password } = req.body;

    // 1️⃣ 필수 항목 비어있는지 수동 체크 (에러 메세지를 개별로 보여줄 수 있음)
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

    // 2️⃣ 값이 있으면 Joi로 형식 검사
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

    // 3️⃣ 비밀번호 해시
    bcrypt.hash(password, 10, async (err, hashedPassword) => {
        if (err) {
            return res.send('Error hashing password.');
        }

        // 4️⃣ MongoDB에 사용자 추가
        try {
            const newUser = new User({
                username: username,
                email: email,
                password: hashedPassword
            });

            await newUser.save();

            // 5️⃣ 세션에 저장 후 리다이렉트
            req.session.user = { username, email };
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
    res.send(`
        <form method="POST" action="/loginSubmit">
            <input type="email" name="email" placeholder="Email">
            <input type="password" name="password" placeholder="Password">
            <button type="submit">Log In</button>
        </form>
    `);
});

app.post('/loginSubmit', async (req, res) => {
    const { email, password } = req.body;

    // 1️⃣ 필수 항목 검사
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

    // 2️⃣ Joi 형식 검사
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

    // 3️⃣ DB에서 사용자 찾기
    const user = await User.findOne({ email: email });
    if (!user) {
        return res.send(`
            <p>User not found.</p>
            <a href="/login">Go back to Log In</a>
        `);
    }

    // 4️⃣ 비밀번호 비교
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        return res.send(`
            <p>Invalid password.</p>
            <a href="/login">Go back to Log In</a>
        `);
    }

    // 5️⃣ 세션에 사용자 이름 저장 후 이동
    req.session.user = { username: user.username, email: user.email };
    res.redirect('/members');
});

app.get('/members', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const username = req.session.user.username;

    const images = ['image1.jpg', 'image2.jpg', 'image3.jpg'];
    const randomIndex = Math.floor(Math.random() * images.length);
    const selectedImage = images[randomIndex];

    res.send(`
        <h1>Hello, ${username}.</h1>
        <img src="${selectedImage}" alt="Random Image" style="max-width:300px;">
        <br><br>
        <a href="/logout">Sign out</a>
    `);
});


app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.send('Error logging out.');
        }
        res.redirect('/');
    });
});

app.use((req, res) => {
    res.status(404).send(`
        <h1>404 - Page Not Found</h1>
        <p>The page you are looking for does not exist.</p>
        <a href="/">Return to Home</a>
    `);
});



app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});