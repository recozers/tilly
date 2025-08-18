const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// Create Supabase client with service role key for admin access
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function populateUserProfiles() {
  console.log('Starting user profile population...')
  
  try {
    // Get all users from auth.users
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
    
    if (usersError) {
      console.error('Error fetching users:', usersError)
      return
    }

    console.log(`Found ${users.users.length} users in auth.users`)

    // Get existing profiles
    const { data: existingProfiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('*')
    
    if (profilesError) {
      console.error('Error fetching existing profiles:', profilesError)
      return
    }

    const existingProfileIds = new Set(existingProfiles.map(p => p.id))
    console.log(`Found ${existingProfiles.length} existing profiles`)

    // Find users without profiles
    const usersWithoutProfiles = users.users.filter(user => !existingProfileIds.has(user.id))
    console.log(`Found ${usersWithoutProfiles.length} users without profiles`)

    // Check existing profiles for missing/empty display names or email-based names
    const profilesToUpdate = existingProfiles.filter(profile => 
      !profile.display_name || 
      profile.display_name.trim() === '' || 
      profile.display_name === 'User' ||
      profile.display_name === profile.email // Also fix email-based display names
    )
    console.log(`Found ${profilesToUpdate.length} profiles with missing/generic names`)

    // Create profiles for users without them
    const profilesToCreate = usersWithoutProfiles.map(user => {
      const displayName = extractDisplayName(user)
      return {
        id: user.id,
        display_name: displayName,
        email: user.email,
        bio: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        allow_friend_requests: true,
        public_availability: false,
        default_meeting_duration: 30,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    })

    if (profilesToCreate.length > 0) {
      console.log('Creating profiles for users:')
      profilesToCreate.forEach(profile => {
        console.log(`  - ${profile.display_name} (${profile.email})`)
      })

      // Insert profiles in batches
      const batchSize = 10
      let created = 0
      
      for (let i = 0; i < profilesToCreate.length; i += batchSize) {
        const batch = profilesToCreate.slice(i, i + batchSize)
        
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert(batch)
        
        if (insertError) {
          console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError)
          continue
        }
        
        created += batch.length
        console.log(`Created ${batch.length} profiles (${created}/${profilesToCreate.length})`)
      }
    }

    // Update existing profiles with missing names
    if (profilesToUpdate.length > 0) {
      console.log('\nUpdating profiles with missing names:')
      let updated = 0
      
      for (const profile of profilesToUpdate) {
        // Find the corresponding auth user
        const authUser = users.users.find(u => u.id === profile.id)
        if (!authUser) continue
        
        const newDisplayName = extractDisplayName(authUser)
        
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ 
            display_name: newDisplayName,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id)
        
        if (updateError) {
          console.error(`Error updating profile for ${profile.email}:`, updateError)
          continue
        }
        
        console.log(`  - Updated ${profile.email}: "${profile.display_name}" → "${newDisplayName}"`)
        updated++
      }
      
      console.log(`Updated ${updated} existing profiles`)
    }

    console.log(`Processing complete!`)
    
    // Verify the results
    const { data: finalProfiles, error: finalError } = await supabase
      .from('user_profiles')
      .select('id, display_name, email')
      .order('created_at', { ascending: false })
    
    if (finalError) {
      console.error('Error verifying results:', finalError)
      return
    }
    
    console.log(`\nFinal count: ${finalProfiles.length} total profiles`)
    console.log('All profiles:')
    finalProfiles.forEach(profile => {
      console.log(`  - ${profile.display_name} (${profile.email})`)
    })
    
  } catch (error) {
    console.error('Script failed:', error)
  }
}

// Helper function to extract display name from user data
function extractDisplayName(user) {
  // Try multiple sources for display name
  if (user.user_metadata?.display_name) {
    return user.user_metadata.display_name
  }
  
  if (user.user_metadata?.name) {
    return user.user_metadata.name
  }
  
  if (user.user_metadata?.full_name) {
    return user.user_metadata.full_name
  }
  
  // Extract name from email (everything before @)
  if (user.email) {
    const emailName = user.email.split('@')[0]
    // Convert email names like "john.doe" or "john_doe" to "John Doe"
    return emailName
      .replace(/[._-]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }
  
  return 'User'
}

// Run the script
if (require.main === module) {
  populateUserProfiles()
    .then(() => {
      console.log('Script completed')
      process.exit(0)
    })
    .catch(error => {
      console.error('Script failed:', error)
      process.exit(1)
    })
}

module.exports = { populateUserProfiles } 
