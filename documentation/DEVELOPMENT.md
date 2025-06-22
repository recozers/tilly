# Development Documentation

## Development Environment Setup

### Prerequisites

- **Node.js 22.x**: Required runtime environment
- **npm 8.0.0+**: Package manager
- **Git**: Version control
- **Code Editor**: VS Code recommended with extensions:
  - ES7+ React/Redux/React-Native snippets
  - Prettier - Code formatter
  - ESLint

### Initial Setup

1. **Clone the repository**:
```bash
git clone [repository-url]
cd tilly
```

2. **Install dependencies**:
```bash
npm install
```

3. **Environment configuration**:
Create `.env` file with required variables:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-your-api-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. **Database setup**:
- Create Supabase project
- Enable Row Level Security
- Tables created automatically on first use

## Development Workflow

### Running the Application

**Full stack development (recommended)**:
```bash
npm run dev:full
```

**Frontend only**:
```bash
npm run dev
```

**Backend only**:
```bash
npm run server
```

### Code Structure

```
src/
├── App.jsx              # Main application component
├── App.css              # Global styles
├── index.jsx            # Application entry point
├── components/          # React components
│   ├── Auth/           # Authentication components
│   └── CalendarAI.jsx  # AI chat interface
├── contexts/           # React contexts
├── hooks/              # Custom React hooks
├── lib/                # External service configurations
├── claudeApi.js        # AI API integration
└── eventsApi.js        # Backend API integration
```

## Coding Standards

### JavaScript/React Conventions

- **ES6+ syntax**: Use modern JavaScript features
- **Functional components**: Prefer function components with hooks
- **Named exports**: Use named exports for components
- **Props validation**: Document component props
- **Error boundaries**: Implement error handling

### Code Formatting

```bash
# Format code
npm run format

# Lint code
npm run lint
```

### Git Workflow

1. **Branch naming**: `feature/description` or `fix/description`
2. **Commit messages**: Use conventional commits format
3. **Pull requests**: Required for all changes
4. **Testing**: All tests must pass before merge

## Testing Strategy

### Test Types

**Unit Tests**: Individual component/function testing
```bash
npm test
```

**Integration Tests**: API endpoint and service testing
```bash
npm run test:real
```

**Coverage Reports**:
```bash
npm run test:coverage
```

### Writing Tests

**Component testing example**:
```javascript
describe('EventComponent', () => {
  test('renders event title correctly', () => {
    const event = { title: 'Test Meeting', start: new Date(), end: new Date() };
    render(<EventComponent event={event} />);
    expect(screen.getByText('Test Meeting')).toBeInTheDocument();
  });
});
```

**API testing example**:
```javascript
describe('Events API', () => {
  test('creates event successfully', async () => {
    const eventData = { title: 'Test Event', start: new Date(), end: new Date() };
    const response = await request(app)
      .post('/api/events')
      .send(eventData)
      .expect(201);
    expect(response.body.title).toBe('Test Event');
  });
});
```

## API Development

### Adding New Endpoints

1. **Define route** in `server.js`:
```javascript
app.get('/api/new-endpoint', authenticateUser, async (req, res) => {
  try {
    // Implementation
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

2. **Add database operations** in `supabase.js`:
```javascript
const newOperation = async (data, userId) => {
  // Database logic with user isolation
  const { data: result, error } = await supabase
    .from('table')
    .select('*')
    .eq('user_id', userId);
  
  if (error) throw error;
  return result;
};
```

3. **Create frontend API function** in `eventsApi.js`:
```javascript
export const callNewEndpoint = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/new-endpoint`, { headers });
  return await handleResponse(response);
};
```

### Error Handling Patterns

**Server-side error handling**:
```javascript
try {
  // Operation
} catch (error) {
  console.error('Operation failed:', error);
  res.status(500).json({ 
    error: 'Operation failed', 
    details: error.message 
  });
}
```

**Client-side error handling**:
```javascript
try {
  const result = await apiCall();
} catch (error) {
  setError(error.message);
  // Show user-friendly error message
}
```

## Database Development

### Schema Changes

All schema changes handled through Supabase dashboard:
1. **Tables**: Create/modify in Supabase SQL editor
2. **RLS Policies**: Ensure user isolation
3. **Indexes**: Add for performance optimization

### Row Level Security

Always implement RLS for new tables:
```sql
-- Enable RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "user_isolation" ON new_table
  FOR ALL USING (auth.uid() = user_id);
```

## AI Integration Development

### Adding New AI Tools

1. **Define tool schema** in server.js:
```javascript
{
  name: "new_tool",
  description: "Tool description",
  input_schema: {
    type: "object",
    properties: {
      param: { type: "string", description: "Parameter description" }
    },
    required: ["param"]
  }
}
```

2. **Implement tool execution**:
```javascript
async function executeNewTool(input, req) {
  try {
    // Validate input
    // Execute operation
    // Return result
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

3. **Add to tool switch statement**:
```javascript
case 'new_tool':
  toolResult = await executeNewTool(content.input, req);
  break;
```

## Performance Optimization

### Frontend Optimization

- **React.memo**: Prevent unnecessary re-renders
- **useMemo/useCallback**: Optimize expensive calculations
- **Lazy loading**: Load components on demand
- **Bundle analysis**: Monitor bundle size

### Backend Optimization

- **Database indexing**: Optimize query performance
- **Response caching**: Cache static responses
- **Connection pooling**: Efficient database connections
- **Compression**: Enable gzip compression

## Debugging

### Frontend Debugging

**React DevTools**: Browser extension for React debugging
**Console logging**: Strategic console.log placement
**Error boundaries**: Catch and handle React errors
**Network tab**: Monitor API requests

### Backend Debugging

**Server logs**: Check console output for errors
**Database logs**: Monitor Supabase logs
**API testing**: Use Postman or similar tools
**Health checks**: Monitor `/health` endpoint

### Common Issues

**CORS errors**: Check CORS configuration
**Authentication failures**: Verify JWT tokens
**Database connection**: Check Supabase configuration
**Environment variables**: Verify all required vars set

## Deployment

### Build Process

```bash
# Frontend build
npm run build

# Creates optimized production build in dist/
```

### Environment Configuration

**Development**: Local `.env` file
**Production**: Environment variables in deployment platform

### Pre-deployment Checklist

- [ ] All tests passing
- [ ] Build successful
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Security review completed

## Monitoring and Maintenance

### Health Monitoring

**Application health**: Monitor `/health` endpoint
**Error rates**: Track error frequency
**Performance metrics**: Monitor response times
**User activity**: Track usage patterns

### Maintenance Tasks

**Dependency updates**: Regular npm updates
**Security patches**: Apply security updates promptly
**Database maintenance**: Monitor query performance
**Log rotation**: Manage log file sizes

## Contributing Guidelines

### Code Review Process

1. **Create feature branch** from main
2. **Implement changes** with tests
3. **Run test suite** and ensure all pass
4. **Submit pull request** with description
5. **Address review comments**
6. **Merge after approval**

### Code Quality Standards

- **Test coverage**: Maintain high test coverage
- **Documentation**: Update docs for new features
- **Security**: Security review for sensitive changes
- **Performance**: Consider performance implications

### Communication

- **Clear commit messages**: Describe what and why
- **Pull request descriptions**: Explain changes thoroughly
- **Issue tracking**: Use GitHub issues for bugs/features
- **Code comments**: Explain complex logic

This development guide ensures consistent, maintainable, and secure code development practices. 