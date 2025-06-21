// Real Connection Test - Testing actual Supabase connection
const { supabase } = require('../supabase');

describe('Real Supabase Connection', () => {
  test('should be able to connect to Supabase', async () => {
    console.log('Testing Supabase connection...');
    console.log('Supabase URL:', process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
    console.log('Has Anon Key:', !!(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY));
    
    try {
      // Try a simple query that doesn't require authentication
      const { data, error } = await supabase
        .from('events')
        .select('count')
        .limit(1);
      
      if (error) {
        console.error('Supabase connection error:', error);
        throw error;
      }
      
      console.log('✅ Supabase connection successful');
      expect(error).toBeNull();
    } catch (err) {
      console.error('Connection test failed:', err.message);
      console.error('Full error:', err);
      throw err;
    }
  }, 10000);
  
  test('should have required environment variables', () => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    expect(supabaseUrl).toBeDefined();
    expect(supabaseUrl).toContain('supabase');
    expect(supabaseKey).toBeDefined();
    expect(supabaseKey.length).toBeGreaterThan(20);
  });
}); 