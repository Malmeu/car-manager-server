const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./config');

const app = express();

// Configuration CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware pour parser le JSON
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Configuration de multer pour les uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const vehicleId = req.body.vehicleId;
      const type = req.body.type;
      
      console.log('Processing upload request:', { vehicleId, type, file: file.originalname });
      
      if (!vehicleId || !type) {
        console.error('Missing required fields:', { vehicleId, type });
        return cb(new Error('Missing vehicleId or type'));
      }

      const uploadPath = path.join(__dirname, '../public/documents', vehicleId, type);
      console.log('Creating upload path:', uploadPath);
      
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      console.error('Error in destination function:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    try {
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.originalname}`;
      console.log('Generated filename:', fileName);
      cb(null, fileName);
    } catch (error) {
      console.error('Error in filename function:', error);
      cb(error);
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  }
});

// Servir les fichiers statiques
app.use('/documents', express.static(path.join(__dirname, '../public/documents')));

// Créer le dossier documents s'il n'existe pas
const documentsPath = path.join(__dirname, '../public/documents');
if (!fs.existsSync(documentsPath)) {
  fs.mkdirSync(documentsPath, { recursive: true });
  console.log('Created documents directory:', documentsPath);
}

// Route pour l'upload de fichiers
app.post('/api/upload', (req, res) => {
  console.log('Received upload request with body:', req.body);
  
  // Utiliser multer comme middleware
  upload.single('file')(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({
        message: 'File upload error',
        error: err.message
      });
    } else if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({
        message: 'Upload error',
        error: err.message
      });
    }

    try {
      if (!req.file) {
        console.error('No file in request');
        return res.status(400).json({
          message: 'No file uploaded',
          error: 'File is required'
        });
      }

      console.log('Request body after file upload:', req.body);
      const { vehicleId, type } = req.body;
      
      if (!vehicleId || !type) {
        console.error('Missing required fields after upload:', { vehicleId, type });
        return res.status(400).json({
          message: 'Missing required fields',
          error: 'vehicleId and type are required'
        });
      }

      console.log('File uploaded successfully:', {
        vehicleId,
        type,
        filename: req.file.filename,
        size: req.file.size
      });

      const relativePath = path.join('/documents', vehicleId, type, req.file.filename);
      res.json({
        message: 'File uploaded successfully',
        path: relativePath
      });
    } catch (error) {
      console.error('Error processing upload:', error);
      res.status(500).json({
        message: 'Error processing upload',
        error: error.message
      });
    }
  });
});

// Routes pour les conditions
app.post('/api/vehicles/:vehicleId/conditions', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    console.log('Adding condition for vehicle:', vehicleId);
    console.log('Condition data:', req.body);

    const conditionData = {
      id: uuidv4(),
      ...req.body,
    };

    const vehicleRef = db.collection('vehicles').doc(vehicleId);
    const vehicle = await vehicleRef.get();

    if (!vehicle.exists) {
      console.log('Vehicle not found:', vehicleId);
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const vehicleData = vehicle.data() || {};
    const conditions = vehicleData.conditions || [];
    conditions.push(conditionData);

    await vehicleRef.update({
      conditions: conditions
    });

    console.log('Condition added successfully:', conditionData);
    res.status(201).json(conditionData);
  } catch (error) {
    console.error('Error adding condition:', error);
    res.status(500).json({ error: 'Error adding condition', details: error.message });
  }
});

app.delete('/api/vehicles/:vehicleId/conditions/:conditionId', async (req, res) => {
  try {
    const { vehicleId, conditionId } = req.params;
    console.log('Deleting condition:', { vehicleId, conditionId });

    const vehicleRef = db.collection('vehicles').doc(vehicleId);
    const vehicle = await vehicleRef.get();

    if (!vehicle.exists) {
      console.log('Vehicle not found:', vehicleId);
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const vehicleData = vehicle.data();
    const conditions = (vehicleData.conditions || []).filter(
      condition => condition.id !== conditionId
    );

    await vehicleRef.update({ conditions: conditions });
    console.log('Condition deleted successfully');
    res.status(200).json({ message: 'Condition deleted successfully' });
  } catch (error) {
    console.error('Error deleting condition:', error);
    res.status(500).json({ error: 'Error deleting condition', details: error.message });
  }
});

// Récupérer un véhicule avec toutes ses données
app.get('/api/vehicles/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    console.log('Getting vehicle data for ID:', vehicleId);

    const vehicleRef = db.collection('vehicles').doc(vehicleId);
    const vehicle = await vehicleRef.get();

    if (!vehicle.exists) {
      console.log('Vehicle not found:', vehicleId);
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const vehicleData = vehicle.data();
    console.log('Vehicle data:', vehicleData);

    res.json({
      vehicleId,
      ...vehicleData,
      conditions: vehicleData.conditions || []
    });
  } catch (error) {
    console.error('Error getting vehicle:', error);
    res.status(500).json({ error: 'Error getting vehicle data', details: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Documents directory: ${documentsPath}`);
});
