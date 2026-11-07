import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import sharp from 'sharp';
import type MongoStore from 'connect-mongo';
import { Database } from '../../src/config/database.js';
import { createApp, type AppDependencies } from '../../src/app.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { parseEnvironment } from '../../src/config/env.js';
import { createSessionStore } from '../../src/config/session.js';
import { AdminService, createAdminModel } from '../../src/modules/admins/index.js';
import { MediaService, createMediaModel } from '../../src/modules/media/index.js';
import { CategoryService, createCategoryModel } from '../../src/modules/categories/index.js';
import { CourseService, createCourseModel } from '../../src/modules/courses/index.js';
import { LectureService, createLectureModel } from '../../src/modules/lectures/index.js';
import { testEnvironment } from '../helpers.js';
export class Phase25Fixture {
  readonly prefix = 'phase25-' + randomUUID();
  readonly uri = process.env.TEST_MONGODB_URI;
  readonly logger = createLogger('silent');
  readonly db = new Database(this.logger);
  readonly adminModel = createAdminModel(this.db.connection);
  readonly admins = new AdminService(this.adminModel);
  readonly mediaModel = createMediaModel(this.db.connection);
  readonly media = new MediaService(this.mediaModel);
  readonly categoryModel = createCategoryModel(this.db.connection);
  readonly categories = new CategoryService(this.categoryModel);
  readonly courseModel = createCourseModel(this.db.connection);
  readonly courses = new CourseService(this.courseModel, this.categories);
  readonly lectureModel = createLectureModel(this.db.connection);
  readonly lectures = new LectureService(this.lectureModel, this.courses);
  readonly email = randomUUID() + '@example.com';
  readonly password = randomBytes(24).toString('base64url');
  readonly origin = 'http://localhost:5174';
  store!: MongoStore;
  app!: ReturnType<typeof createApp>;
  agent!: ReturnType<typeof request.agent>;
  token = '';
  uploader = '';
  sessions = new Set<string>();
  async start(extra: Partial<AppDependencies> = {}) {
    if (!this.uri || !/^to_academy_test(?:_[a-z0-9]+)?$/.test(new URL(this.uri).pathname.slice(1)))
      throw new Error('Dedicated TEST_MONGODB_URI required');
    await this.db.connect(this.uri);
    this.store = await createSessionStore(this.db.connection);
    await Promise.all([
      this.admins.ensureIndexes(),
      this.media.ensureIndexes(),
      this.categories.ensureIndexes(),
      this.courses.ensureIndexes(),
      this.lectures.ensureIndexes(),
    ]);
    this.uploader = (
      await this.admins.createInitialAdmin({
        name: 'Phase25 tester',
        email: this.email,
        password: this.password,
      })
    ).id;
    const env = parseEnvironment({ ...testEnvironment, MONGODB_URI: this.uri });
    this.app = createApp({
      env,
      logger: this.logger,
      store: this.store,
      admins: this.admins,
      media: this.media,
      categories: this.categories,
      courses: this.courses,
      lectures: this.lectures,
      isReady: () => this.db.ping(),
      ...extra,
    });
    this.agent = request.agent(this.app);
    for (const phase of ['before', 'after']) {
      const res = await this.agent.get('/api/v1/auth/csrf').set('Origin', this.origin).expect(200);
      this.token = res.body.data.csrfToken as string;
      const record = await (
        await this.store.collectionP
      ).findOne({ 'session.csrfToken': this.token });
      if (record) this.sessions.add(record._id);
      if (phase === 'before')
        await this.agent
          .post('/api/v1/auth/login')
          .set('Origin', this.origin)
          .set('X-CSRF-Token', this.token)
          .send({ email: this.email, password: this.password })
          .expect(200);
    }
  }
  write(method: 'post' | 'patch' | 'delete', path: string) {
    return this.agent[method](path).set('Origin', this.origin).set('X-CSRF-Token', this.token);
  }
  async image(visibility: 'public' | 'private' = 'public') {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#0022ff' } })
      .png()
      .toBuffer();
    const staged = await this.media.stage(
      Readable.from([png]),
      'image/png',
      'fixture.png',
      this.uploader,
    );
    return (await this.media.finish(staged, visibility)).id;
  }
  async stop() {
    try {
      if (this.db.connection.readyState === 1) {
        await this.lectureModel.deleteMany({ slug: { $regex: '^' + this.prefix } });
        await this.courseModel.deleteMany({ slug: { $regex: '^' + this.prefix } });
        await this.categoryModel.deleteMany({ slug: { $regex: '^' + this.prefix } });
        for (const row of await this.mediaModel.find({ uploadedBy: this.uploader }).lean())
          await this.media.discard(row._id.toString());
        await this.adminModel.deleteOne({ email: this.email });
        if (this.store)
          await (await this.store.collectionP).deleteMany({ _id: { $in: [...this.sessions] } });
      }
    } finally {
      await this.db.disconnect();
    }
  }
}
