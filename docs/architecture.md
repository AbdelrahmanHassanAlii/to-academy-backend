# TO Academy — Master Project Implementation Instructions

Act as my **Senior Software Architect, Technical Lead, and Full-Stack Engineer**.

You are working on a real client project called **TO Academy**. Your responsibility is to inspect the existing repositories, establish the architecture, and implement the MVP in a clean, maintainable, production-conscious way.

You must prioritize correctness, simplicity, security, maintainability, and delivery within the available timeline.

---

# 1. Project Overview

TO Academy is an online training academy targeting young people and graduates in Egypt.

The academy provides practical training programs that help students develop professional skills and prepare for the job market.

The initial website must allow visitors to:

- Discover the academy.
- Browse available training programs.
- View individual course details.
- Discover free introductory lectures.
- Register for courses and free lectures.
- Read professional articles and career advice.
- Contact the academy.

The academy administrators must be able to manage the website content through a private dashboard.

This is an MVP, not a complete Learning Management System.

## Initial course categories

1. HR — Human Resources.
2. Marketing — Digital Marketing and Marketing Skills.
3. Job Market Preparation — CVs, Interviews, and Career Preparation.
4. Programming — Programming and Technical Skills.
5. English — Professional and Workplace English.

Courses and lectures must be manageable dynamically through the admin dashboard.

---

# 2. Workspace and Repository Structure

The parent workspace contains exactly three independent Git repositories.

## Repository 1 — Backend

Git remote:

https://github.com/AbdelrahmanHassanAlii/to-academy-backend.git

Local directory:

`to-academy-backend/`

## Repository 2 — Public Website

Git remote:

https://github.com/AbdelrahmanHassanAlii/to-academy-public.git

Local directory:

`to-academy-public/`

## Repository 3 — Admin Dashboard

Git remote:

https://github.com/AbdelrahmanHassanAlii/to-academy-admin.git

Local directory:

`to-academy-admin/`

Expected workspace:

```text
TO-Academy/
├── to-academy-backend/
├── to-academy-public/
└── to-academy-admin/
```

IMPORTANT RULES:

- These are three independent Git repositories.
- Do not create a fourth Git repository in the parent directory.
- Do not convert the architecture into a monorepo.
- Do not create npm workspaces or Turborepo.
- Do not move the three projects into a different repository.
- Do not change existing Git remotes.
- Do not delete existing repository content without understanding it.
- Keep each project's dependencies and configuration independent.
- Do not directly import code from one repository into another.
- The only communication between projects is through documented HTTP API contracts.

Before making any modifications:

1. Inspect all three directories.
2. Check whether each directory is already a Git repository.
3. Inspect its current Git branch, status, remotes, and recent commits.
4. Inspect all existing files and project configurations.
5. Identify existing implementations that should be preserved.
6. Determine whether the repositories are empty, partially initialized, or already developed.
7. Create a concise architecture and implementation assessment.

If a directory is missing and the parent workspace is available, clone its corresponding repository into the expected directory.

Never overwrite existing uncommitted changes.

---

# 3. Absolute Infrastructure Rule: NO DOCKER

I explicitly do not want Docker used anywhere in this project.

Do not create:

- Dockerfiles.
- docker-compose.yml.
- docker-compose.yaml.
- Container configurations.
- Docker development environments.
- Docker-based database configurations.
- Container-based deployment instructions.

All development and execution must happen directly on the host machine.

Use:

- Node.js LTS.
- npm.
- MongoDB installed locally or MongoDB Atlas.
- Normal Node.js development servers.
- Standard deployment platforms that support Node.js and static websites.

All documentation must contain normal local development instructions.

---

# 4. Technology Stack

## Backend

- Node.js.
- Express.js.
- TypeScript.
- MongoDB.
- Mongoose.
- Zod for request validation.
- express-session for authentication sessions.
- connect-mongo for MongoDB session storage.
- bcrypt for password hashing.
- Helmet for HTTP security headers.
- CORS with explicit allowed origins.
- Centralized error handling.
- Structured logging.

Use stable, maintained dependencies compatible with the selected Node.js version.

## Public Website

- React.
- Vite.
- TypeScript.
- React Router.
- React Query (TanStack Query) for server state.
- Axios or a well-structured Fetch API client.
- React Hook Form.
- Zod.
- A maintainable styling solution.

The public website must support prerendering for SEO-critical pages.

Choose a maintained prerendering/SSG approach compatible with React and Vite. Evaluate its compatibility with dynamic routes before selecting it.

## Admin Dashboard

- React.
- Vite.
- TypeScript.
- React Router.
- React Query.
- Axios or Fetch API.
- React Hook Form.
- Zod.
- A maintainable component and styling architecture.

Do not unnecessarily introduce complex state management libraries.

---

# 5. Backend Architecture

The backend must follow a modular architecture.

Every business module must have its own:

- model
- routes
- controller
- service
- validators
- utils

Use the following structure as the architectural target:

```text
to-academy-backend/
│
├── src/
│   │
│   ├── config/
│   │   ├── database.ts
│   │   ├── env.ts
│   │   ├── cors.ts
│   │   └── session.ts
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/
│   │   │   ├── model/
│   │   │   ├── routes/
│   │   │   ├── controller/
│   │   │   ├── service/
│   │   │   ├── validators/
│   │   │   └── utils/
│   │   │
│   │   ├── admins/
│   │   │
│   │   ├── categories/
│   │   │
│   │   ├── courses/
│   │   │
│   │   ├── lectures/
│   │   │
│   │   ├── registrations/
│   │   │
│   │   ├── articles/
│   │   │
│   │   ├── settings/
│   │   │
│   │   └── media/
│   │
│   ├── shared/
│   │   ├── middleware/
│   │   ├── errors/
│   │   ├── utils/
│   │   ├── constants/
│   │   ├── types/
│   │   └── validators/
│   │
│   ├── infrastructure/
│   │   ├── storage/
│   │   └── logging/
│   │
│   ├── routes/
│   │   └── index.ts
│   │
│   ├── app.ts
│   └── server.ts
│
├── scripts/
│   └── seed-admin.ts
│
├── tests/
│
├── docs/
│
├── .env.example
├── package.json
└── tsconfig.json
```

This is the target architecture, not a reason to create empty folders unnecessarily.

Implement actual functionality in each module.

## Backend architecture rules

1. Models are responsible for Mongoose schemas and database structure.
2. Routes define endpoints and middleware composition.
3. Controllers handle HTTP requests and responses.
4. Services contain business logic and database operations.
5. Validators validate incoming request parameters, queries, and bodies.
6. Utils contain module-specific helper functions.
7. Shared utilities belong in `src/shared/`.
8. Controllers must not contain business logic.
9. Modules must not directly depend on another module's controllers.
10. Avoid circular dependencies.
11. Use consistent response structures.
12. Use centralized error handling.
13. Use TypeScript types instead of unnecessary `any`.
14. Avoid overengineering.

## API versioning

Use:

`/api/v1`

Organize routes by module.

Suggested endpoints:

```text
/api/v1/auth
/api/v1/admins
/api/v1/categories
/api/v1/courses
/api/v1/lectures
/api/v1/registrations
/api/v1/articles
/api/v1/settings
/api/v1/media
```

Separate public endpoints from administrator endpoints.

For example:

```text
GET    /api/v1/courses
GET    /api/v1/courses/:slug

POST   /api/v1/admin/courses
PATCH  /api/v1/admin/courses/:id
DELETE /api/v1/admin/courses/:id
```

Public APIs must never expose unpublished content.

---

# 6. Database Design

Use MongoDB as the single application database.

Design the following collections:

## Admins

Fields:

- name
- email
- passwordHash
- role
- isActive
- lastLoginAt
- timestamps

Only administrators can access the dashboard.

Do not implement public administrator registration.

Provide a secure seed script to create the first administrator.

Never hardcode production credentials.

## Categories

Fields:

- name
- slug
- description
- image
- isActive
- sortOrder
- timestamps

Categories should support future additions and modifications.

Seed the five initial categories.

## Courses

Fields:

- title
- slug
- shortDescription
- description
- category
- thumbnail
- curriculum
- lecturesCount
- duration
- targetAudience
- trainingMethod
- price
- currency
- isFree
- status
- SEO metadata
- timestamps

Course status:

- draft
- published
- archived

Use EGP as the initial currency.

Do not assume every course has a published price.

## Lectures

Fields:

- title
- slug
- description
- content
- scheduledAt
- duration
- meetingUrl
- thumbnail
- status
- SEO metadata
- timestamps

Lecture status:

- draft
- published
- completed
- cancelled

The meeting URL is managed by administrators.

Do not integrate Zoom APIs.

## Registrations

Support registration for both courses and free lectures.

Fields:

- fullName
- email
- phone
- whatsappNumber (optional)
- registrationType
- course reference (optional)
- lecture reference (optional)
- status
- notes
- timestamps

Registration status:

- pending
- confirmed
- cancelled

Apply appropriate database indexes and prevent duplicate registrations where appropriate.

Collect only necessary personal information.

## Articles

Fields:

- title
- slug
- excerpt
- content
- thumbnail
- author
- status
- SEO metadata
- publishedAt
- timestamps

Support draft and published articles.

## Settings

Store editable academy information:

- academyName
- logo
- contact information
- social media links
- address
- about content
- footer information
- SEO defaults

## Media

Store uploaded images and files in MongoDB using GridFS.

Do not use Base64 inside normal MongoDB documents for large files.

Implement:

- Upload validation.
- Allowed MIME types.
- File size limits.
- Secure download and retrieval.
- Metadata management.
- File deletion.
- Proper authorization.

Only implement the minimum media functionality needed by the MVP.

---

# 7. Authentication and Security

Use server-side session authentication for administrators.

Preferred implementation:

- express-session
- connect-mongo
- HTTP-only cookies
- Secure cookies in production
- Appropriate SameSite configuration
- Explicit CORS origins
- Credentials support
- CSRF protection
- Session expiration
- Password hashing using bcrypt

Authentication endpoints:

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

The frontend must use credentialed requests.

Never store session identifiers in localStorage.

Implement authentication and authorization middleware.

Protect every admin endpoint.

Validate all input on the backend.

Apply sensible rate limits to login and public registration endpoints.

Never expose:

- Password hashes.
- Session identifiers.
- Private configuration.
- Unpublished content through public endpoints.

Do not trust frontend validation alone.

---

# 8. Public Website

The public website is an independent application.

Its responsibility is to display published academy content and collect registrations.

## Required pages

```text
/
├── /about
├── /courses
│   └── /courses/:slug
├── /lectures
│   └── /lectures/:slug
├── /articles
│   └── /articles/:slug
├── /contact
└── /privacy-policy
```

## Homepage sections

1. Navigation bar.
2. Hero section introducing TO Academy.
3. About the academy.
4. Training categories.
5. Featured courses.
6. Upcoming free lectures.
7. Why choose TO Academy.
8. Latest articles.
9. Call-to-action section.
10. Footer.

## Course details

Each course page should display:

- Title.
- Description.
- Thumbnail.
- Curriculum.
- Number of lectures.
- Duration.
- Target audience.
- Training method.
- Price, when available.
- Registration CTA.

## Free lectures

Display:

- Lecture title.
- Description.
- Date and time.
- Duration.
- Registration button.
- Registration form.

Never expose the meeting URL publicly before the appropriate registration/administrative process.

## Registration forms

Collect:

- Full name.
- Phone number.
- Email (optional where appropriate).
- WhatsApp number (optional).

Validate forms on the frontend and backend.

Display clear success and error states.

Do not implement email confirmation or automated WhatsApp messaging.

## Design requirements

The website must have a professional, modern, trustworthy educational identity.

Default language: Arabic.

Default direction: RTL.

Prepare the architecture for future English support.

Use:

- Responsive layouts.
- Consistent spacing.
- Reusable components.
- Accessible form controls.
- Proper loading states.
- Empty states.
- Error states.

Establish centralized design tokens for colors, typography, spacing, and border radii.

Use a suitable Arabic font and ensure English typography remains readable.

Do not use generic, unfinished-looking templates.

---

# 9. Admin Dashboard

The admin dashboard is a completely independent React application.

It communicates only with the backend API.

## Required pages

```text
/login

/dashboard

/dashboard/courses
/dashboard/courses/create
/dashboard/courses/:id/edit

/dashboard/lectures
/dashboard/lectures/create
/dashboard/lectures/:id/edit

/dashboard/registrations

/dashboard/articles
/dashboard/articles/create
/dashboard/articles/:id/edit

/dashboard/categories

/dashboard/media

/dashboard/settings
```

## Dashboard features

### Dashboard overview

Display basic operational information:

- Total courses.
- Published courses.
- Upcoming lectures.
- Total registrations.
- Pending registrations.

These are operational database counts, not analytics integrations.

### Course management

- Create courses.
- Edit courses.
- Delete or archive courses.
- Publish and unpublish courses.
- Assign categories.
- Manage curriculum.
- Upload thumbnails.
- Change prices.

### Lecture management

- Create lectures.
- Edit lectures.
- Schedule lectures.
- Add meeting URLs.
- Cancel or complete lectures.
- View registrations.

### Registration management

- View registrations.
- Filter by course or lecture.
- Filter by status.
- View registration details.
- Change registration status.
- Export registrations to CSV.

CSV exports must be protected by administrator authorization and should handle Arabic text correctly.

### Article management

- Create articles.
- Edit articles.
- Publish and unpublish articles.
- Upload thumbnails.
- Manage SEO fields.

### Settings

Allow administrators to update academy information and contact details.

Use a clean, professional dashboard interface with reusable tables, forms, modals, notifications, and layout components.

---

# 10. SEO and Prerendering

SEO is important because TO Academy targets people searching for professional training in Egypt.

Implement:

- Page titles.
- Meta descriptions.
- Canonical URLs.
- Open Graph metadata.
- Sitemap.xml.
- Robots.txt.
- Semantic HTML.
- Structured data where appropriate.
- Clean URL slugs.
- Arabic-friendly metadata.

Use React + Vite with prerendering.

At minimum, prerender:

- Homepage.
- About page.
- Courses listing.
- Published course detail pages.
- Published lecture pages.
- Published articles.
- Contact page.

Dynamic content must be retrieved from the backend during the prerender/build process.

Document how new or updated SEO content triggers a rebuild and deployment.

Do not pretend that build-time prerendering automatically updates when MongoDB changes.

---

# 11. Explicitly Excluded Features

Do not implement the following in the MVP:

- Docker.
- Docker Compose.
- Google Analytics or other analytics integrations.
- WhatsApp Business API integration.
- Automated WhatsApp messaging.
- Email provider integration.
- Automated email notifications.
- External file storage services.
- Payment gateways.
- Online checkout.
- Student accounts.
- Student learning dashboards.
- Video hosting.
- LMS functionality.
- Online quizzes.
- Exams.
- Certificates.
- Course progress tracking.
- Complex role and permission systems.

Keep the architecture extensible enough to add these later without implementing them now.

---

# 12. API Contracts and Cross-Repository Consistency

The backend is the source of truth for API behavior.

Create API documentation using OpenAPI/Swagger.

Document:

- Endpoints.
- Request bodies.
- Query parameters.
- Response structures.
- Error responses.
- Authentication requirements.
- Pagination.

Maintain consistent response structures.

Example:

```json
{
  "success": true,
  "message": "Course retrieved successfully",
  "data": {},
  "meta": null
}
```

Example error:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": []
}
```

Each frontend must define its own local TypeScript API types or generate them from the backend OpenAPI specification.

Do not create a fourth shared-code repository.

Do not manually maintain multiple incompatible versions of the same API contract.

---

# 13. Environment Configuration

Each repository must have its own `.env.example`.

Never commit actual secrets.

Backend environment variables should include:

```env
NODE_ENV=
PORT=
MONGODB_URI=
SESSION_SECRET=
SESSION_COOKIE_NAME=
PUBLIC_APP_URL=
ADMIN_APP_URL=
ALLOWED_ORIGINS=
```

Add other variables only when genuinely required.

Public and admin frontends should have their own API base URL configuration.

Validate required backend environment variables at application startup.

Never silently substitute insecure production defaults.

---

# 14. Testing and Quality

Implement a sensible testing strategy.

Backend:

- Unit tests for important services.
- Validation tests.
- Authentication tests.
- API integration tests.
- Registration tests.

Frontends:

- Build verification.
- Important component tests.
- Form validation tests.
- Basic user-flow tests.

Ensure:

- TypeScript builds successfully.
- No obvious linting errors.
- No hardcoded secrets.
- No exposed administrator endpoints.
- No broken navigation.
- No broken API integration.
- No unhandled errors.

Avoid writing excessive tests for trivial functionality at the expense of delivering the MVP.

---

# 15. Implementation Strategy

Work incrementally.

Do not attempt to implement the entire application in one huge operation.

## Phase 0 — Repository Audit and Architecture

- Inspect all three repositories.
- Understand existing code.
- Identify missing infrastructure.
- Verify Git status and remotes.
- Prepare the architecture documentation.
- Identify potential conflicts and risks.
- Define the API contract.

Deliverable: Architecture and implementation plan.

## Phase 1 — Backend Foundation

- Initialize or improve backend configuration.
- Configure MongoDB.
- Configure Express.
- Configure TypeScript.
- Implement environment validation.
- Implement error handling.
- Implement logging.
- Configure CORS.
- Configure sessions.
- Establish module architecture.

Deliverable: A working backend foundation.

## Phase 2 — Authentication and Core Modules

Implement:

1. Admin authentication.
2. Categories.
3. Courses.
4. Lectures.
5. Registrations.
6. Articles.
7. Settings.
8. Media.

Implement CRUD operations and public/admin API separation.

Deliverable: Working backend API.

## Phase 3 — Admin Dashboard

Implement:

- Login.
- Protected routes.
- Dashboard overview.
- Course management.
- Lecture management.
- Registration management.
- Article management.
- Settings.
- Media uploads.

Deliverable: Functional admin portal.

## Phase 4 — Public Website

Implement:

- Main layout.
- Homepage.
- Courses listing.
- Course details.
- Free lectures.
- Lecture details.
- Registration forms.
- Articles.
- Contact.
- Responsive design.
- RTL.
- Prerendering and SEO.

Deliverable: Functional public website.

## Phase 5 — Integration and Quality Assurance

- Test all API connections.
- Test registration workflows.
- Test administrator authentication.
- Test course publication.
- Test media upload and retrieval.
- Test CSV export.
- Verify prerendered pages.
- Verify responsive layouts.
- Fix critical issues.
- Document deployment.

Deliverable: MVP ready for client review.

---

# 16. Development Workflow Rules

Follow these rules throughout the project.

1. Inspect before modifying.
2. Understand existing implementations before replacing them.
3. Work on one repository at a time unless a cross-repository change is necessary.
4. Keep each repository independently runnable.
5. Implement reusable components where appropriate.
6. Avoid unnecessary abstractions.
7. Avoid premature optimization.
8. Use descriptive naming.
9. Keep functions small and focused.
10. Handle errors properly.
11. Never hardcode credentials.
12. Never commit `.env` files.
13. Never use Docker.
14. Do not create unnecessary dependencies.
15. Keep the architecture aligned with the MVP.
16. Update documentation when implementation decisions change.
17. Do not claim functionality is complete unless it has been implemented and tested.
18. Never silently ignore failing builds or tests.

Use meaningful Git commit messages.

Do not push to GitHub, create pull requests, or change remote branches without my explicit approval.

Do not discard existing work.

---

# 17. Important Execution Instructions

I am the developer and project owner.

I have full-stack development experience and will review your implementation.

Do not treat me as a beginner.

I prefer clean architecture and understandable code over excessive abstractions.

My constraints:

- Solo developer.
- 2–4 weeks.
- Budget below 15,000 EGP.
- Client owns the project.
- MERN stack.
- Three independent repositories.
- No Docker.

You should make reasonable technical decisions independently.

If something is ambiguous but not blocking, document your assumption and continue.

If something is genuinely blocking or would cause a major architectural decision, ask me before proceeding.

Do not ask unnecessary questions.

Do not implement features outside the MVP.

---

# 18. Your First Task

Do not start generating the entire application immediately.

Start with **Phase 0 — Repository Audit and Architecture**.

Inspect the three repositories and produce:

1. Current state of each repository.
2. Existing technology stack and dependencies.
3. Existing directory structures.
4. Existing Git status and branches.
5. Missing or incomplete project configurations.
6. Proposed final folder structure for each repository.
7. Backend module boundaries.
8. MongoDB schema relationships.
9. API endpoint plan.
10. Authentication and session architecture.
11. Frontend routing plan.
12. Prerendering strategy.
13. Environment configuration plan.
14. Development commands for each project.
15. Implementation sequence and realistic workload.
16. Risks and technical decisions that need my approval.

Save the architecture documentation in the appropriate repository documentation directories.

The parent workspace can contain a simple README explaining the three repositories, but it must not become a fourth Git repository.

After completing Phase 0, summarize your findings and propose the exact implementation steps for Phase 1.

Do not proceed with destructive changes or major implementation decisions without explaining them first.

**The goal is to build a professional, maintainable TO Academy MVP that can be delivered within 2–4 weeks without unnecessary infrastructure or complexity.**