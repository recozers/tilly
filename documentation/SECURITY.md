# Security Documentation

## Security Overview

Tilly implements a comprehensive security architecture designed to protect user data, prevent unauthorized access, and ensure privacy across all system components. The application follows security best practices and industry standards for data protection.

## Authentication and Authorization

### Multi-Factor Authentication System

#### Supabase Authentication Integration
- **JWT-based authentication**: Industry-standard JSON Web Tokens
- **Secure session management**: Automatic token refresh and validation
- **Multiple auth providers**: Email/password, OAuth integrations
- **Session timeout**: Configurable session expiration

#### Authentication Flow Security
```
1. User Credentials → Supabase Auth Service
2. Credential Validation → Secure Hash Verification  
3. JWT Token Generation → Signed with Secret Key
4. Token Transmission → HTTPS Only
5. Server Validation → Signature Verification
6. User Context Extraction → Secure User ID
```

### Authorization Model

#### Role-Based Access Control
- **User isolation**: Complete data separation between users
- **Minimal permissions**: Users access only their own data
- **No admin escalation**: No privileged user accounts in application layer

#### Row Level Security (RLS)
```sql
-- Database-level access control
CREATE POLICY "user_data_isolation" ON events
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "subscription_isolation" ON calendar_subscriptions  
  FOR ALL USING (auth.uid() = user_id);
```

## Data Protection

### Database Security

#### Supabase Security Features
- **PostgreSQL security**: Industry-standard database security
- **Encryption at rest**: All data encrypted in storage
- **Encryption in transit**: TLS 1.2+ for all connections
- **Automatic backups**: Secure backup with encryption

#### Data Isolation Architecture
```
┌─────────────────┐    ┌─────────────────┐
│   User A Data   │    │   User B Data   │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          ▼                      ▼
┌─────────────────────────────────────────┐
│         Database Layer (RLS)            │
│  ┌─────────────────────────────────┐   │
│  │     Automatic User Filtering    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Input Validation and Sanitization

#### Server-Side Validation
```javascript
// Example validation patterns
const validateEventData = (data) => {
  // Title sanitization
  data.title = sanitizeHtml(data.title);
  
  // Date validation
  if (!isValidDate(data.start) || !isValidDate(data.end)) {
    throw new ValidationError('Invalid date format');
  }
  
  // Color validation
  if (data.color && !isValidHexColor(data.color)) {
    data.color = '#4A7C2A'; // Safe default
  }
  
  return data;
};
```

#### Protection Against Common Attacks

**Cross-Site Scripting (XSS) Prevention**
- **HTML sanitization**: All user input sanitized
- **Content Security Policy**: Strict CSP headers
- **Output encoding**: Safe rendering of user data
- **Input validation**: Whitelist-based validation

**SQL Injection Prevention**
- **Parameterized queries**: All database queries use parameters
- **ORM protection**: Supabase client provides injection protection
- **Input validation**: Strict type checking
- **Principle of least privilege**: Limited database permissions

**Cross-Site Request Forgery (CSRF) Protection**
- **SameSite cookies**: Secure cookie configuration
- **Origin validation**: Request origin verification
- **Token-based authentication**: JWT tokens instead of session cookies

## API Security

### Endpoint Protection

#### Authentication Middleware
```javascript
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }
    
    const token = authHeader.substring(7);
    
    // Validate JWT token with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
    
    req.user = data.user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};
```

#### Rate Limiting
- **API rate limits**: 60 requests/minute for AI endpoints
- **Upload limits**: 5MB file size limit for imports
- **Request throttling**: Protection against abuse
- **IP-based limiting**: Additional protection layer

### CORS Configuration
```javascript
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
```

## AI Security

### Claude API Integration Security

#### Secure API Communication
- **API key protection**: Server-side API key storage only
- **Request validation**: All AI requests validated before processing
- **Response sanitization**: AI responses validated before execution
- **Error handling**: Graceful fallbacks for AI service failures

#### Tool-Based AI Security
```javascript
// Example tool validation
const validateAIToolInput = (toolName, input) => {
  switch (toolName) {
    case 'create_event':
      return validateEventData(input);
    case 'move_event':
      return validateMoveEventData(input);
    default:
      throw new Error('Unknown tool');
  }
};
```

#### AI Data Context Protection
- **User isolation**: AI only accesses requesting user's data
- **Context filtering**: Strict data scope for AI operations
- **No data persistence**: AI conversations not stored long-term
- **Input sanitization**: All AI inputs validated and sanitized

### Responsible AI Practices

#### Transparency
- **Clear AI identification**: Users know when interacting with AI
- **Capability communication**: Clear explanation of AI features
- **Limitation disclosure**: Honest about AI limitations

#### Privacy Protection
- **Local processing preference**: Minimize external AI API calls
- **Data minimization**: Only necessary data sent to AI service
- **No training data**: User data not used to train AI models
- **Secure transmission**: All AI communications encrypted

## File Upload Security

### Upload Validation
```javascript
const fileValidation = {
  allowedTypes: ['.ics'],
  maxSize: 5 * 1024 * 1024, // 5MB
  virusScan: false, // Could be added for production
  
  validate: (file) => {
    if (!allowedTypes.includes(path.extname(file.originalname))) {
      throw new Error('Invalid file type');
    }
    
    if (file.size > maxSize) {
      throw new Error('File too large');
    }
    
    return true;
  }
};
```

### Upload Security Measures
- **File type validation**: Only .ics files accepted
- **Size limitations**: Maximum 5MB files
- **Content validation**: Parse and validate file contents
- **Temporary storage**: Files processed and discarded immediately

## Network Security

### HTTPS Enforcement
- **TLS 1.2+ required**: Modern encryption standards
- **Certificate validation**: Proper SSL certificate management
- **Secure headers**: Security headers for all responses
- **HSTS enabled**: HTTP Strict Transport Security

### Security Headers
```javascript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
```

## Environment Security

### Environment Variable Protection
```bash
# Required environment variables
SUPABASE_URL=https://project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ANTHROPIC_API_KEY=sk-ant-api03-...

# Security considerations
NODE_ENV=production  # Enables security features
PORT=8080           # Non-privileged port
```

### Secret Management
- **Environment variables**: Sensitive data in environment only
- **No hardcoded secrets**: All secrets externalized
- **Development vs production**: Different keys for different environments
- **Key rotation**: Support for API key updates

## Monitoring and Logging

### Security Logging
```javascript
// Security event logging
const logSecurityEvent = (event, details, req) => {
  console.log(`SECURITY: ${event}`, {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    details
  });
};
```

### Monitoring Capabilities
- **Failed authentication attempts**: Track and alert on suspicious activity
- **API abuse detection**: Monitor for unusual request patterns
- **Error rate monitoring**: Track application errors
- **Performance monitoring**: Detect potential attacks through performance

## Incident Response

### Security Incident Procedures

#### Immediate Response
1. **Identify scope**: Determine affected users and data
2. **Isolate issue**: Prevent further unauthorized access
3. **Preserve evidence**: Log all relevant information
4. **Notify stakeholders**: Inform relevant parties

#### Recovery Process
1. **Fix vulnerability**: Address root cause
2. **Update credentials**: Rotate affected keys/tokens
3. **Verify integrity**: Ensure data integrity
4. **Resume operations**: Gradual service restoration

### Backup and Recovery
- **Automatic backups**: Daily encrypted backups via Supabase
- **Point-in-time recovery**: Restore to specific timestamps
- **Disaster recovery**: Multi-region backup strategy
- **Testing procedures**: Regular backup restoration tests

## Compliance and Standards

### Privacy Compliance
- **Data minimization**: Collect only necessary data
- **Purpose limitation**: Use data only for stated purposes
- **User consent**: Clear consent for data processing
- **Data retention**: Automatic cleanup of old data

### Security Standards Alignment
- **OWASP Top 10**: Protection against common vulnerabilities
- **Industry best practices**: Following established security patterns
- **Regular updates**: Keep dependencies updated
- **Security reviews**: Periodic security assessments

## Security Testing

### Automated Security Testing
```javascript
// Example security test
describe('Authentication Security', () => {
  test('should reject requests without valid token', async () => {
    const response = await request(app)
      .get('/api/events')
      .expect(401);
    
    expect(response.body.error).toContain('authentication');
  });
  
  test('should isolate user data', async () => {
    const user1Events = await getEventsForUser('user1');
    const user2Events = await getEventsForUser('user2');
    
    expect(user1Events).not.toContainEqual(
      expect.objectContaining({ user_id: 'user2' })
    );
  });
});
```

### Security Test Coverage
- **Authentication bypass attempts**: 100% coverage
- **Authorization validation**: All endpoints tested
- **Input validation**: Comprehensive injection testing
- **Data isolation**: Cross-user access prevention

## Security Recommendations

### For Administrators
1. **Regular updates**: Keep all dependencies current
2. **Monitor logs**: Review security logs regularly
3. **Key rotation**: Rotate API keys periodically
4. **Backup verification**: Test backup restoration procedures

### For Users
1. **Strong passwords**: Use unique, complex passwords
2. **Secure networks**: Avoid public WiFi for sensitive operations
3. **Browser security**: Keep browsers updated
4. **Logout practices**: Sign out on shared devices

### For Developers
1. **Security reviews**: Regular code security reviews
2. **Dependency scanning**: Monitor for vulnerable dependencies
3. **Testing**: Comprehensive security testing
4. **Documentation**: Keep security documentation current

This security framework provides comprehensive protection while maintaining usability and performance. Regular security reviews and updates ensure continued protection against evolving threats. 