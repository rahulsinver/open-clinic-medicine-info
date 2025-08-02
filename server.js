const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// Dynamic import for node-fetch (ES module)
let fetch;

// Initialize fetch
const initializeFetch = async () => {
  const nodeFetch = await import('node-fetch');
  fetch = nodeFetch.default;
};

// Initialize fetch on startup
initializeFetch();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Helper function to sanitize and format medicine data
function formatMedicineData(medicineData, searchName) {
  return {
    name: searchName,
    brandName: medicineData.openfda?.brand_name?.[0] || searchName,
    genericName: medicineData.openfda?.generic_name?.[0] || 'N/A',
    manufacturer: medicineData.openfda?.manufacturer_name?.[0] || 'N/A',
    indications: medicineData.indications_and_usage?.[0] || 'Information not available',
    mechanism: medicineData.mechanism_of_action?.[0] || 'Information not available',
    sideEffects: medicineData.adverse_reactions?.[0] || 'Information not available',
    dosage: medicineData.dosage_and_administration?.[0] || 'Information not available',
    precautions: medicineData.warnings?.[0] || medicineData.precautions?.[0] || 'Information not available',
    contraindications: medicineData.contraindications?.[0] || 'Information not available',
    drugInteractions: medicineData.drug_interactions?.[0] || 'Information not available'
  };
}

// API endpoint for medicine search
app.get('/api/medicine', async (req, res) => {
  const medicineName = req.query.name;
  
  if (!medicineName || medicineName.trim() === '') {
    return res.status(400).json({ 
      error: 'Medicine name is required. Please enter a valid medicine name.' 
    });
  }

  // Sanitize input
  const sanitizedName = medicineName.trim().replace(/[^\w\s-]/g, '');
  
  if (sanitizedName.length < 2) {
    return res.status(400).json({ 
      error: 'Medicine name must be at least 2 characters long.' 
    });
  }

  // Wait for fetch to be initialized
  if (!fetch) {
    return res.status(503).json({ 
      error: 'Service is initializing. Please try again in a moment.' 
    });
  }

  try {
    // Try multiple search strategies for better results
    const searchStrategies = [
      `openfda.brand_name:"${sanitizedName}"`,
      `openfda.generic_name:"${sanitizedName}"`,
      `openfda.brand_name:${sanitizedName}`,
      `openfda.generic_name:${sanitizedName}`
    ];

    let medicineData = null;
    let searchStrategy = '';

    for (const strategy of searchStrategies) {
      try {
        const apiUrl = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(strategy)}&limit=1`;
        console.log(`Trying search strategy: ${strategy}`);
        
        const apiResponse = await fetch(apiUrl);
        
        if (apiResponse.ok) {
          const data = await apiResponse.json();
          if (data.results && data.results.length > 0) {
            medicineData = data.results[0];
            searchStrategy = strategy;
            break;
          }
        }
      } catch (strategyError) {
        console.log(`Strategy failed: ${strategy}`, strategyError.message);
        continue;
      }
    }

    if (medicineData) {
      const formattedData = formatMedicineData(medicineData, sanitizedName);
      console.log(`Found medicine data using strategy: ${searchStrategy}`);
      return res.json(formattedData);
    } else {
      return res.status(404).json({ 
        error: `No information found for "${sanitizedName}". Please check the spelling or try a different medicine name.`,
        suggestions: [
          'Check the spelling of the medicine name',
          'Try using the generic name instead of brand name (or vice versa)',
          'Use the full medicine name without abbreviations'
        ]
      });
    }

  } catch (error) {
    console.error('Error fetching medicine data:', error);
    return res.status(500).json({ 
      error: 'Unable to retrieve medicine information at this time. Please try again later.',
      details: 'Our medical database service is temporarily unavailable.'
    });
  }
});

// API endpoint for medicine suggestions (basic implementation)
app.get('/api/suggestions', async (req, res) => {
  const query = req.query.q;
  
  if (!query || query.trim().length < 2) {
    return res.json({ suggestions: [] });
  }

  try {
    // This is a basic implementation - in production, you'd want a more sophisticated search
    const commonMedicines = [
      'Aspirin', 'Ibuprofen', 'Acetaminophen', 'Amoxicillin', 'Lisinopril',
      'Metformin', 'Amlodipine', 'Metoprolol', 'Omeprazole', 'Simvastatin',
      'Losartan', 'Albuterol', 'Gabapentin', 'Sertraline', 'Montelukast'
    ];

    const suggestions = commonMedicines
      .filter(med => med.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);

    return res.json({ suggestions });
  } catch (error) {
    console.error('Error getting suggestions:', error);
    return res.json({ suggestions: [] });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🏥 Open Clinic server running on http://localhost:${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
});
