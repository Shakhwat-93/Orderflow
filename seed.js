const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
  console.log('Starting seed process...');

  // 1. Create a test user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: 'admin@example.com',
    password: 'password123',
  });

  if (authError && authError.message !== 'User already registered') {
    console.error('Error creating user:', authError);
    return;
  }

  let user = authData?.user;
  
  if (!user) {
    // If already registered, try to sign in to get the UUID
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: 'admin@example.com',
        password: 'password123',
    });
    if (signInError) {
        console.error('Failed to login existing seed user:', signInError);
        return;
    }
    user = signInData.user;
    console.log('Seed user already existed, signed in instead.');
  } else {
    console.log('Created seed user admin@example.com');
  }

  // Set Profile to Admin
  await supabase.from('profiles').upsert({
    id: user.id,
    role: 'Admin',
    full_name: 'System Admin'
  });

  // 2. Clear old orders (optional based on RLS, but here we just insert)
  console.log('Generating test orders...');
  
  const mockOrders = [
    {
      id: 'ORD-1001',
      customer_name: 'Alice Johnson',
      phone: '+1 555-0100',
      product: 'Premium Silk Shirt',
      size: 'M',
      source: 'Website',
      status: 'New',
      amount: 120.50,
      items: 2
    },
    {
      id: 'ORD-1002',
      customer_name: 'Bob Smith',
      phone: '+1 555-0101',
      product: 'Cotton T-Shirt',
      size: 'L',
      source: 'Facebook',
      status: 'Pending Call',
      amount: 85.00,
      items: 1
    },
    {
      id: 'ORD-1003',
      customer_name: 'Charlie Davis',
      phone: '+1 555-0102',
      product: 'Denim Jacket',
      size: 'XL',
      source: 'Website',
      status: 'Confirmed',
      amount: 250.00,
      items: 4
    },
    {
      id: 'ORD-1004',
      customer_name: 'Diana Prince',
      phone: '+1 555-0103',
      product: 'Summer Dress',
      size: 'S',
      source: 'Facebook',
      status: 'Courier Submitted',
      amount: 45.00,
      items: 1,
      tracking_id: 'TRK-987654321'
    },
    {
      id: 'ORD-1005',
      customer_name: 'Evan Wright',
      phone: '+1 555-0104',
      product: 'Leather Belt',
      size: 'One-Size',
      source: 'Instagram',
      status: 'Factory Processing',
      amount: 320.00,
      items: 5
    },
    {
      id: 'ORD-1006',
      customer_name: 'Fiona Gallagher',
      phone: '+1 555-0105',
      product: 'Woolen Sweater',
      size: 'L',
      source: 'Website',
      status: 'Completed',
      amount: 99.99,
      items: 2
    }
  ];

  const { error: insertError } = await supabase.from('orders').upsert(mockOrders);

  if (insertError) {
    console.error('Failed to insert mock orders:', insertError);
  } else {
    console.log('Successfully seeded 6 mock orders into the database.');
  }

  console.log('Seed complete! You can now log in with admin@example.com / password123');
}

seed();
