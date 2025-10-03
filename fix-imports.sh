#!/bin/bash
# Fix import paths in moved test files

# Fix server tests
find server/__tests__ -name "*.test.ts" -exec sed -i 's|from '\''../server/|from '\''../|g' {} \;

# Fix src tests  
find src/__tests__ -name "*.test.ts" -exec sed -i 's|from '\''../src/|from '\''../|g' {} \;

echo "Import paths fixed for new test structure"