// src/supabaseClient.js
// This file connects your app to your Supabase project.
// Get these two values from: Supabase dashboard -> Settings -> API

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
