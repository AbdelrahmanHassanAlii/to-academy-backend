import { pino, type DestinationStream, type LevelWithSilent } from 'pino';

export function createLogger(level: LevelWithSilent = 'info', destination?: DestinationStream) {
  const options = {
    level,
    base: null,
    redact: {
      paths: [
        'password',
        'passwordHash',
        'sessionId',
        'csrfToken',
        'secret',
        'MONGODB_URI',
        'SESSION_SECRET',
        'req.headers',
        'req.body',
        'res.headers',
        'err.message',
        'err.stack',
      ],
      censor: '[REDACTED]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
