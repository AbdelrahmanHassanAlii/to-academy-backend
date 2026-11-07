import { randomUUID } from 'node:crypto';
import {
  createPublicMediaRoutes,
  createAdminMediaRoutes,
  type MediaService,
} from './modules/media/index.js';
import express, { type Router } from 'express';
import type { Store } from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { Environment } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { sessionMiddleware } from './config/session.js';
import { openapiDocument } from './config/openapi.js';
import { createSessionRoutes } from './routes/index.js';
import { enforceSessionExpiry } from './shared/middleware/csrf.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import { notFound } from './shared/middleware/not-found.js';
import { AppError } from './shared/errors/app-error.js';
import { success } from './shared/utils/response.js';
import { createAuthRoutes } from './modules/auth/index.js';
import { createAdminRoutes, type AdminService } from './modules/admins/index.js';
import {
  createPublicCategoryRoutes,
  createAdminCategoryRoutes,
  type CategoryService,
} from './modules/categories/index.js';
import {
  createPublicCourseRoutes,
  createAdminCourseRoutes,
  type CourseService,
} from './modules/courses/index.js';
import {
  createPublicLectureRoutes,
  createAdminLectureRoutes,
  type LectureService,
} from './modules/lectures/index.js';
import {
  createPublicRegistrationRoutes,
  createAdminRegistrationRoutes,
  type RegistrationService,
} from './modules/registrations/index.js';

export interface AppDependencies {
  env: Environment;
  logger: Logger;
  isReady: () => Promise<boolean>;
  store?: Store;
  additionalRoutes?: Router;
  admins?: AdminService;
  categories?: CategoryService;
  courses?: CourseService;
  lectures?: LectureService;
  registrations?: RegistrationService;
  media?: MediaService;
}

export function createApp({
  env,
  logger,
  isReady,
  store,
  additionalRoutes,
  admins,
  categories,
  courses,
  lectures,
  registrations,
  media,
}: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('query parser', 'simple');
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        err: () => ({ code: 'REQUEST_FAILED' }),
      },
    }),
  );
  app.use(
    helmet({
      // Local Swagger must work on plain HTTP; production retains HSTS and upgrade-insecure-requests.
      strictTransportSecurity: env.NODE_ENV === 'production',
      contentSecurityPolicy: {
        directives: { 'upgrade-insecure-requests': env.NODE_ENV === 'production' ? [] : null },
      },
    }),
  );
  app.use(cors(corsOptions(env)));
  app.use(express.json({ limit: '100kb' }));
  if (media) app.use('/api/v1/media', createPublicMediaRoutes(media));
  if (categories) app.use('/api/v1/categories', createPublicCategoryRoutes(categories));
  if (courses) app.use('/api/v1/courses', createPublicCourseRoutes(courses));
  if (lectures) app.use('/api/v1/lectures', createPublicLectureRoutes(lectures));
  if (registrations)
    app.use('/api/v1/registrations', createPublicRegistrationRoutes(registrations, env));
  app.get('/api/v1/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    success(res, { status: 'ok' }, 'Service is alive');
  });
  app.get('/api/v1/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let ready = false;
    try {
      ready = await isReady();
    } catch {
      /* Readiness reports safe dependency status only. */
    }
    if (!ready) throw new AppError(503, 'NOT_READY', 'Service is not ready');
    success(res, { status: 'ready' }, 'Service is ready');
  });
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openapiDocument);
  });
  app.use(
    '/api/v1/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiDocument as object, {
      swaggerOptions: { url: '/api/v1/openapi.json', supportedSubmitMethods: [] },
    }),
  );
  if (store) {
    app.use(
      '/api/v1',
      sessionMiddleware(env, store),
      enforceSessionExpiry(env),
      createSessionRoutes(env),
    );
    if (admins) {
      if (media) app.use('/api/v1/admin/media', createAdminMediaRoutes(media, admins, env));
      app.use('/api/v1/auth', createAuthRoutes(admins, env));
      app.use('/api/v1/admin/admins', createAdminRoutes(admins, env));
      if (categories)
        app.use('/api/v1/admin/categories', createAdminCategoryRoutes(categories, admins, env));
      if (courses) app.use('/api/v1/admin/courses', createAdminCourseRoutes(courses, admins, env));
      if (lectures)
        app.use('/api/v1/admin/lectures', createAdminLectureRoutes(lectures, admins, env));
      if (registrations)
        app.use(
          '/api/v1/admin/registrations',
          createAdminRegistrationRoutes(registrations, admins, env),
        );
    }
    if (additionalRoutes) app.use('/api/v1', additionalRoutes);
  } else {
    // Unit tests may construct the non-session foundation. Runtime startup always supplies MongoStore.
    app.get('/api/v1/auth/csrf', () => {
      throw new AppError(503, 'SESSION_UNAVAILABLE', 'Session service is unavailable');
    });
  }
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
