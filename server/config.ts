import convict from 'convict';

// Define the configuration schema
const config = convict({
  env: {
    doc: 'The application environment',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  server: {
    port: {
      doc: 'The port to bind the server to',
      format: 'port',
      default: 5000,
      env: 'PORT'
    },
    host: {
      doc: 'The IP address to bind the server to',
      format: String,
      default: '127.0.0.1',
      env: 'HOST'
    }
  }
});

// Environment-specific overrides
if (config.get('env') === 'development') {
  config.load({
    server: {
      host: '127.0.0.1' // localhost for development
    }
  });
} else if (config.get('env') === 'production') {
  config.load({
    server: {
      host: '0.0.0.0' // accept connections from any interface in production
    }
  });
}

// Validate the configuration
config.validate({ allowed: 'strict' });

export default config;
