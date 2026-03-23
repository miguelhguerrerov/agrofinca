// ============================================
// AgroFinca - App Configuration
// Centralized Supabase + App Constants
// ============================================

const AppConfig = {
  // Supabase centralized project
  SUPABASE_URL: 'https://fqxdwyxmfzlkchcmlhzg.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxeGR3eXhtZnpsa2NoY21saHpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTY5ODEsImV4cCI6MjA4OTg3Mjk4MX0.ugxEAK7RxXXf1SpzKF4CatGNPiXvqMigUWzOSkWu4SQ',

  // PayPal (client ID only - secret is in Edge Functions)
  PAYPAL_CLIENT_ID: 'ASGZyeOw_p2Om-how1aZ5hjP5avpOlN4pXCA0iPXQa8YSeZUeODKPvrZO4YR3TFtY6F_-CEzoqHEoHBN',

  // App settings
  APP_VERSION: '2.0.0',
  APP_NAME: 'AgroFinca',

  // Freemium limits
  FREE_FARM_LIMIT: 2,
  PLAN_FREE: 'free',
  PLAN_PAID: 'paid',

  // User roles in finca
  ROL_PROPIETARIO: 'propietario',
  ROL_TRABAJADOR: 'trabajador',

  // Gemini AI (calls go through Edge Function, key is server-side only)
  GEMINI_MODEL: 'gemini-3-flash-preview',

  // Photo settings
  MAX_PHOTO_WIDTH: 1200,
  PHOTO_QUALITY: 0.8
};
