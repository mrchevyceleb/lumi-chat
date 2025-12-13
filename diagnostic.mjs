// Diagnostic script to check RAG documents
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mwwoahlygzvietmhklvy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY environment variable');
  console.log('You can find this in: Supabase Dashboard > Settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const userId = '649c0938-7160-4fb9-9991-8f54a9231cff';

async function runDiagnostics() {
  console.log('\n=== RAG DIAGNOSTIC REPORT ===\n');

  // 1. Total documents
  const { count: totalCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });
  console.log(`1. Total documents: ${totalCount}`);

  // 2. Documents with user_id column matching
  const { count: columnCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  console.log(`2. Documents with user_id COLUMN = your ID: ${columnCount}`);

  // 3. Documents with metadata user_id matching
  const { count: metadataCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('metadata->>user_id', userId);
  console.log(`3. Documents with metadata.user_id = your ID: ${metadataCount}`);

  // 4. Sample documents to see actual values
  const { data: samples } = await supabase
    .from('documents')
    .select('id, user_id, metadata, content')
    .limit(5);
  
  console.log('\n4. Sample documents:');
  samples?.forEach((doc, i) => {
    console.log(`   [${i+1}] user_id column: ${doc.user_id || 'NULL'}`);
    console.log(`       metadata.user_id: ${doc.metadata?.user_id || 'NOT SET'}`);
    console.log(`       content preview: ${doc.content?.slice(0, 60)}...`);
  });

  // 5. Distinct user_id values
  const { data: distinctUsers } = await supabase
    .from('documents')
    .select('user_id')
    .limit(100);
  
  const uniqueUserIds = [...new Set(distinctUsers?.map(d => d.user_id))];
  console.log(`\n5. Unique user_id values in column: ${uniqueUserIds.length}`);
  uniqueUserIds.slice(0, 5).forEach(uid => console.log(`   - ${uid || 'NULL'}`));

  console.log('\n=== END DIAGNOSTIC ===\n');
}

runDiagnostics().catch(console.error);
