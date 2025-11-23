const express = require('express');
const app = express();
const { MongoClient, ObjectId } = require('mongodb');
const session = require('express-session');
const formidable = require('express-formidable');
const methodOverride = require('method-override');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(formidable());
app.use(session({
    secret: 'comps381f-flight-2025',
    resave: false,
    saveUninitialized: false
}));
app.use(methodOverride('_method'));

const uri = process.env.MONGODB_URI || 'mongodb+srv://123:123456dllm@cluster0.xovjzrh.mongodb.net/flightdb';
const client = new MongoClient(uri);
const dbName = 'flightdb';
let db;

client.connect().then(() => {
    db = client.db(dbName);
    console.log('MongoDB connected');
}).catch(err => console.error('MongoDB connection error:', err));

// Middleware
const requireLogin = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/login');
};

// === Register & Login ===
app.get('/register', (req, res) => res.render('register', { error: null }));
app.post('/register', async (req, res) => {
    const { username, password, name } = req.fields;
    if (!username || !password || !name) return res.render('register', { error: 'All fields required' });
    const existing = await db.collection('users').findOne({ username });
    if (existing) return res.render('register', { error: 'Username exists' });
    const hash = await bcrypt.hash(password, 10);
    const user = { username, password: hash, name, userId: 'u' + Date.now() };
    await db.collection('users').insertOne(user);
    res.render('login', { error: 'Registered! Please login.' });
});

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', async (req, res) => {
    const { username, password } = req.fields;
    const user = await db.collection('users').findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = { id: user.userId, name: user.name };
        res.redirect('/list');
    } else {
        res.render('login', { error: 'Invalid credentials' });
    }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// === UPDATED LIST ROUTE WITH SEARCH ===
app.get('/list', requireLogin, async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        let flights;

        if (searchTerm.trim()) {
            // Search functionality
            const searchQuery = {
                userid: req.session.user.id,
                $or: [
                    { flightNumber: { $regex: searchTerm, $options: 'i' } },
                    { destination: { $regex: searchTerm, $options: 'i' } },
                    { airline: { $regex: searchTerm, $options: 'i' } },
                    { departureAirport: { $regex: searchTerm, $options: 'i' } },
                    { arrivalAirport: { $regex: searchTerm, $options: 'i' } },
                    { status: { $regex: searchTerm, $options: 'i' } },
                    { gate: { $regex: searchTerm, $options: 'i' } }
                ]
            };
            flights = await db.collection('flights').find(searchQuery).sort({ createdAt: -1 }).toArray();
        } else {
            // Get all flights if no search term
            flights = await db.collection('flights').find({ userid: req.session.user.id }).sort({ createdAt: -1 }).toArray();
        }

        res.render('list', { 
            flights, 
            user: req.session.user, 
            success: req.query.success,
            searchTerm: searchTerm
        });
    } catch (error) {
        console.error('Error in /list route:', error);
        res.status(500).render('info', { 
            message: 'Internal server error: ' + error.message, 
            user: req.session.user 
        });
    }
});

// === SEARCH ROUTE (Separate Page) ===
app.get('/search', requireLogin, async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        let flights = [];

        if (searchTerm.trim()) {
            const searchQuery = {
                userid: req.session.user.id,
                $or: [
                    { flightNumber: { $regex: searchTerm, $options: 'i' } },
                    { destination: { $regex: searchTerm, $options: 'i' } },
                    { airline: { $regex: searchTerm, $options: 'i' } },
                    { departureAirport: { $regex: searchTerm, $options: 'i' } },
                    { arrivalAirport: { $regex: searchTerm, $options: 'i' } },
                    { status: { $regex: searchTerm, $options: 'i' } },
                    { gate: { $regex: searchTerm, $options: 'i' } }
                ]
            };
            flights = await db.collection('flights').find(searchQuery).sort({ createdAt: -1 }).toArray();
        } else {
            flights = await db.collection('flights').find({ userid: req.session.user.id }).sort({ createdAt: -1 }).toArray();
        }

        res.render('search', { 
            flights, 
            user: req.session.user, 
            searchTerm,
            resultsCount: flights.length
        });
    } catch (error) {
        console.error('Error in /search route:', error);
        res.status(500).render('info', { 
            message: 'Search error: ' + error.message, 
            user: req.session.user 
        });
    }
});

// === API SEARCH ===
app.get('/api/search', requireLogin, async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        
        if (!searchTerm.trim()) {
            return res.json({ 
                success: false, 
                error: 'Search term is required' 
            });
        }

        const searchQuery = {
            userid: req.session.user.id,
            $or: [
                { flightNumber: { $regex: searchTerm, $options: 'i' } },
                { destination: { $regex: searchTerm, $options: 'i' } },
                { airline: { $regex: searchTerm, $options: 'i' } },
                { departureAirport: { $regex: searchTerm, $options: 'i' } },
                { arrivalAirport: { $regex: searchTerm, $options: 'i' } },
                { status: { $regex: searchTerm, $options: 'i' } },
                { gate: { $regex: searchTerm, $options: 'i' } }
            ]
        };

        const flights = await db.collection('flights')
            .find(searchQuery)
            .sort({ createdAt: -1 })
            .toArray();

        res.json({
            success: true,
            count: flights.length,
            searchTerm: searchTerm,
            data: flights
        });
    } catch (error) {
        console.error('API Search error:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed: ' + error.message
        });
    }
});

// === CRUD Routes ===
app.get('/details', requireLogin, async (req, res) => {
    try {
        const flight = await db.collection('flights').findOne({ _id: new ObjectId(req.query._id), userid: req.session.user.id });
        if (!flight) return res.render('info', { message: 'Flight not found', user: req.session.user });
        res.render('details', { flight, user: req.session.user });
    } catch (error) {
        console.error('Error in /details:', error);
        res.status(500).render('info', { message: 'Error loading flight details', user: req.session.user });
    }
});

app.post('/flights', requireLogin, async (req, res) => {
    try {
        const newFlight = {
            userid: req.session.user.id,
            flightNumber: req.fields.flightNumber,
            destination: req.fields.destination,
            hours: req.fields.hours,
            minutes: req.fields.minutes,
            gate: req.fields.gate || 'N/A',
            status: req.fields.status || 'On Time',
            airline: req.fields.airline || '',
            departureAirport: req.fields.departureAirport || '',
            arrivalAirport: req.fields.arrivalAirport || '',
            departureTime: req.fields.departureTime || '',
            createdAt: new Date()
        };
        if (req.files?.filetoupload?.size > 0) {
            const data = await fs.readFile(req.files.filetoupload.path);
            newFlight.photo = data.toString('base64');
        }
        await db.collection('flights').insertOne(newFlight);
        res.redirect('/list?success=Flight added successfully');
    } catch (error) {
        console.error('Error adding flight:', error);
        res.redirect('/list?error=Failed to add flight');
    }
});

app.get('/edit', requireLogin, async (req, res) => {
    try {
        const flight = await db.collection('flights').findOne({ _id: new ObjectId(req.query._id), userid: req.session.user.id });
        if (!flight) return res.render('info', { message: 'Access denied', user: req.session.user });
        res.render('edit', { flight, user: req.session.user });
    } catch (error) {
        console.error('Error in /edit:', error);
        res.status(500).render('info', { message: 'Error loading edit page', user: req.session.user });
    }
});

app.put('/flights/:id', requireLogin, async (req, res) => {
    try {
        const update = { $set: req.fields };
        if (req.files?.filetoupload?.size > 0) {
            const data = await fs.readFile(req.files.filetoupload.path);
            update.$set.photo = data.toString('base64');
        }
        await db.collection('flights').updateOne({ _id: new ObjectId(req.params.id), userid: req.session.user.id }, update);
        res.redirect('/list?success=Flight updated');
    } catch (error) {
        console.error('Error updating flight:', error);
        res.redirect('/list?error=Failed to update flight');
    }
});

app.delete('/flights/:flightNumber', requireLogin, async (req, res) => {
    try {
        await db.collection('flights').deleteOne({ flightNumber: req.params.flightNumber, userid: req.session.user.id });
        res.redirect('/list?success=Flight deleted');
    } catch (error) {
        console.error('Error deleting flight:', error);
        res.redirect('/list?error=Failed to delete flight');
    }
});

// === RESTful API ===
app.post('/api/flights', requireLogin, async (req, res) => {
    try {
        const doc = { ...req.fields, userid: req.session.user.id };
        if (req.files?.filetoupload) {
            const data = await fs.readFile(req.files.filetoupload.path);
            doc.photo = data.toString('base64');
        }
        const result = await db.collection('flights').insertOne(doc);
        res.json({ success: true, id: result.insertedId });
    } catch (error) {
        console.error('API Error adding flight:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/flights', requireLogin, async (req, res) => {
    try {
        const flights = await db.collection('flights').find({ userid: req.session.user.id }).toArray();
        res.json(flights);
    } catch (error) {
        console.error('API Error getting flights:', error);
        res.status(500).json({ error: 'Failed to fetch flights' });
    }
});

app.get('/api/flights/:flightNumber', requireLogin, async (req, res) => {
    try {
        const flight = await db.collection('flights').findOne({ flightNumber: req.params.flightNumber, userid: req.session.user.id });
        res.json(flight || { error: 'Not found' });
    } catch (error) {
        console.error('API Error getting flight:', error);
        res.status(500).json({ error: 'Failed to fetch flight' });
    }
});

app.put('/api/flights/:flightNumber', requireLogin, async (req, res) => {
    try {
        const update = { $set: req.fields };
        if (req.files?.filetoupload) {
            const data = await fs.readFile(req.files.filetoupload.path);
            update.$set.photo = data.toString('base64');
        }
        const result = await db.collection('flights').updateOne({ flightNumber: req.params.flightNumber, userid: req.session.user.id }, update);
        res.json({ success: result.modifiedCount > 0 });
    } catch (error) {
        console.error('API Error updating flight:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/flights/:flightNumber', requireLogin, async (req, res) => {
    try {
        const result = await db.collection('flights').deleteOne({ flightNumber: req.params.flightNumber, userid: req.session.user.id });
        res.json({ success: result.deletedCount > 0 });
    } catch (error) {
        console.error('API Error deleting flight:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// === API Test Page ===
app.get('/api-test', requireLogin, (req, res) => res.render('api-test', { user: req.session.user }));

app.get('/', requireLogin, (req, res) => res.redirect('/list'));
app.get('*', (req, res) => res.render('info', { message: 'Page not found', user: req.session.user || null }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
