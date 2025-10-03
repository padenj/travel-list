# Application Behavior Specifications

## User Roles and Permissions

### SystemAdmin
- **Access**: All families, users, and system settings
- **Capabilities**: 
  - Create/delete families
  - Add/remove users with any role
  - View audit logs across all families
  - System configuration and maintenance

### FamilyAdmin  
- **Access**: Own family members and data only
- **Capabilities**:
  - Add/remove family members
  - Promote family members to FamilyAdmin role
  - Manage family categories, items, and templates
  - View family audit logs

### FamilyMember
- **Access**: Own family data (read/write), limited user management
- **Capabilities**:
  - Create and manage own packing lists
  - Add/edit family items and categories
  - Use and modify templates
  - Cannot manage other users

## Authentication Behavior

### Initial Setup
- Default administrator account created on first install
- Administrator MUST change password on first login
- Strong password policy enforced (16+ chars, mixed case, numbers, symbols)
- Session expires after 60 days of inactivity

### Login Flow  
1. User enters credentials
2. System validates and returns JWT token
3. If first login for admin, redirect to password change
4. Frontend stores token and displays role-appropriate interface
5. All subsequent API calls include authentication token

## Family and Member Management

### Family Structure
- **Single Family Membership**: Each user belongs to exactly one family
- **Multiple Admins**: Families can have multiple FamilyAdmin users
- **Member Information**: First name, last name, optional email
- **Email Requirements**: Required for FamilyAdmin, optional for FamilyMember

### Family Data Isolation
- Users can only access data from their own family
- SystemAdmin can access all families
- All data (items, categories, templates, lists) scoped to family

## Item and Category Management

### Items and Categories
- **Multi-Category Items**: Items can belong to multiple categories
  - Example: "Winter Jacket" → ["Cold Weather", "International", "Formal"]
- **Member Assignment**: Items assigned to specific family members globally
  - Example: "Laptop" assigned to John, "Child's Toys" assigned to Sally
  - Assignment applies to all templates and packing lists
- **Whole Family Items**: Items can be marked as needed by entire family

### Category System
- **Standard Categories**: International, Cold Weather, Beach, Formal, Work, Car
- **Custom Categories**: Families can create additional categories
- **Category Deletion**: Soft delete preserves historical data

## Template System

### Template Composition
- **Flexible Structure**: Templates can include:
  - Entire categories (dynamic - includes all current items in category)
  - Individual items (static - specific items only)
  - Mix of both approaches
- **Dynamic Updates**: When items are added to categories, category-based templates automatically include them

### Template Usage
- **Base for Packing Lists**: Templates generate initial packing lists
- **Customization During Packing**: Users can add/remove items while packing
- **Template Update Option**: Changes made during packing can optionally update the original template

## Packing List Workflow

### List Creation
1. **Template Selection**: Choose existing template or start blank
2. **Trip Information**: Enter trip name and basic details
3. **Member Assignment**: Assign list items to specific family members
4. **Initial Generation**: System creates packing list with all template items

### Packing Process
- **Item Status**: Mark items as packed/unpacked
- **Add Items**: Add new items during packing process
- **Remove Items**: Remove unneeded items from list
- **Member Sections**: Separate views for each family member's items
- **Whole Family Section**: Shared items visible to all members

### Template Feedback
- **Update Prompt**: When packing list is modified, offer to update source template
- **User Choice**: User decides whether changes should be saved to template
- **New Template**: Option to save modified list as new template

## Offline and Sync Behavior

### Offline Capabilities
- **Full Functionality**: All core features work offline
- **Local Storage**: Changes stored in browser's IndexedDB
- **Sync Queue**: API calls queued when offline, executed when online
- **Conflict Resolution**: Last writer wins automatically (no user intervention)

### Data Synchronization
- **Background Sync**: Automatic sync when connection restored
- **Change Tracking**: All modifications timestamped for conflict resolution
- **Soft Deletes**: Deleted items preserved for sync, with optional restoration
- **Incremental Updates**: Only changed data transmitted during sync

## Default Data and Examples

### Standard Categories (Created for New Families)
1. **International**: Cross-border travel items
2. **Cold Weather**: Winter and cold climate gear  
3. **Beach**: Beach and water activity items
4. **Formal**: Business and formal event attire
5. **Work**: Professional and business travel items
6. **Car**: Road trip and driving essentials

### Example Templates (Provided as Starting Points)
1. **International Beach Vacation**: Combines International + Beach categories
2. **Work Conference**: Combines Work + Formal categories + specific items
3. **Weekend Mountain Trip**: Cold Weather + Car + specific outdoor items
4. **National Park Adventure**: Car + outdoor items + camping gear

### Default Items by Category
- **International**: Passport, Visa, Travel Insurance, Currency, Power Adapter
- **Cold Weather**: Heavy Jacket, Warm Boots, Gloves, Hat, Thermal Underwear  
- **Beach**: Swimsuit, Sunscreen, Beach Towel, Sunglasses, Sandals
- **Formal**: Dress Shirt, Tie, Dress Shoes, Suit, Jewelry
- **Work**: Laptop, Chargers, Business Cards, Notebook, Pens
- **Car**: Driver's License, Car Keys, Phone Charger, Sunglasses, Water Bottle

## User Experience Flows

### New Family Setup
1. SystemAdmin creates family
2. FamilyAdmin user created and assigned to family
3. Default categories and items automatically created
4. Example templates available immediately
5. Family can customize items and create new templates

### Trip Planning Workflow  
1. **Template Selection**: Browse and select appropriate template
2. **Customization**: Add/remove items based on specific trip needs
3. **Member Assignment**: Assign items to specific family members
4. **List Generation**: Create final packing list for trip
5. **Packing Execution**: Check off items as packed
6. **Template Update**: Optionally save modifications back to template