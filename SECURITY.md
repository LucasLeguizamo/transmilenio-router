# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it privately.

**Do not open a public issue for security vulnerabilities.**

### How to Report

1. Email the maintainers directly (see repository contacts)
2. Or use GitHub's private vulnerability reporting feature

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix timeline**: Depends on severity

### After Reporting

- We will acknowledge receipt of your report
- We will investigate and determine the impact
- We will work on a fix and coordinate disclosure
- We will credit you in the release notes (unless you prefer anonymity)

## Security Best Practices for Users

### API Keys

- Never commit API keys to the repository
- Use environment variables (`CROMA_API_KEY`)
- Rotate keys if you suspect compromise
- Use separate keys for development and production

### Deployment

- Run behind HTTPS in production
- Use environment variables for all secrets
- Regularly update dependencies
- Monitor for unusual API usage

### Dependencies

This project regularly audits dependencies:

```bash
pnpm audit
```

Report any concerning dependency vulnerabilities through the same process.

## Scope

This security policy covers:

- The TransMilenio MCP server code
- UI components
- Build and deployment configurations

It does not cover:

- The Croma API (report to Croma directly)
- Third-party MCP hosts (Claude, ChatGPT, Cursor)
- OpenStreetMap tiles or services
