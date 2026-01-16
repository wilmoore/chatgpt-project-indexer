/**
 * API Documentation Edge Function
 *
 * Serves the OpenAPI specification for the ChatGPT Project Indexer API.
 *
 * Endpoints:
 * - GET /functions/v1/docs - Returns OpenAPI JSON spec
 * - GET /functions/v1/docs?format=yaml - Returns OpenAPI YAML spec
 *
 * Usage:
 *   curl http://127.0.0.1:54321/functions/v1/docs
 */

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

// OpenAPI specification embedded as JSON
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ChatGPT Project Indexer API',
    description: `REST API for the ChatGPT Project Indexer.

This API provides access to indexed ChatGPT projects and allows triggering
"touch" operations to float projects to the top of the ChatGPT sidebar.

## Base URLs

- **Local Supabase:** \`http://127.0.0.1:54321\`
- **PostgREST (data):** \`http://127.0.0.1:54321/rest/v1\`
- **Edge Functions:** \`http://127.0.0.1:54321/functions/v1\`

## Touch Operations

The touch queue allows external clients (like Raycast) to request that a
project be "touched" to float it to the top of the ChatGPT sidebar.

Touch requests are processed asynchronously by the indexer's watch mode,
typically within 5-10 seconds.`,
    version: '1.0.0',
    contact: {
      name: 'ChatGPT Project Indexer',
      url: 'https://github.com/wilmoore/chatgpt-project-indexer',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'http://127.0.0.1:54321',
      description: 'Local Supabase instance',
    },
  ],
  tags: [
    { name: 'Projects', description: 'Project data operations' },
    { name: 'Touch', description: 'Touch queue operations' },
    { name: 'Meta', description: 'Index metadata' },
  ],
  paths: {
    '/rest/v1/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List all projects',
        description: 'Returns all indexed ChatGPT projects.',
        operationId: 'listProjects',
        parameters: [
          {
            name: 'select',
            in: 'query',
            description: 'Columns to return',
            schema: { type: 'string', default: '*' },
          },
          {
            name: 'order',
            in: 'query',
            description: 'Sort order',
            schema: { type: 'string' },
            example: 'title.asc',
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum results',
            schema: { type: 'integer', minimum: 1, maximum: 1000 },
          },
        ],
        responses: {
          '200': {
            description: 'List of projects',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Project' },
                },
              },
            },
          },
        },
      },
    },
    '/rest/v1/touch_queue': {
      get: {
        tags: ['Touch'],
        summary: 'List touch queue requests',
        description: 'Returns touch queue requests. Use project_id=eq.{id} to check status.',
        operationId: 'listTouchQueue',
        parameters: [
          {
            name: 'project_id',
            in: 'query',
            description: 'Filter by project ID',
            schema: { type: 'string' },
            example: 'eq.g-p-abc123',
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filter by status',
            schema: { type: 'string' },
            example: 'eq.pending',
          },
        ],
        responses: {
          '200': {
            description: 'List of touch requests',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/TouchRequest' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Touch'],
        summary: 'Queue a touch request',
        description: `Queues a request to touch a project, floating it to the top of the ChatGPT sidebar.

The request is processed asynchronously, typically within 5-10 seconds.

**Example:**
\`\`\`
POST /rest/v1/touch_queue
Content-Type: application/json
apikey: your-anon-key
Prefer: return=representation

{ "project_id": "g-p-abc123" }
\`\`\``,
        operationId: 'createTouchRequest',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['project_id'],
                properties: {
                  project_id: {
                    type: 'string',
                    description: 'ID of the project to touch',
                    example: 'g-p-abc123',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Touch request created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TouchRequest' },
              },
            },
          },
        },
      },
    },
    '/functions/v1/meta': {
      get: {
        tags: ['Meta'],
        summary: 'Get index metadata',
        description: 'Returns metadata about the project index',
        operationId: 'getMeta',
        responses: {
          '200': {
            description: 'Index metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Meta' },
              },
            },
          },
        },
      },
    },
    '/functions/v1/docs': {
      get: {
        tags: ['Meta'],
        summary: 'Get API documentation',
        description: 'Returns this OpenAPI specification',
        operationId: 'getDocs',
        responses: {
          '200': {
            description: 'OpenAPI specification',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Project: {
        type: 'object',
        description: 'A ChatGPT project',
        properties: {
          id: { type: 'string', description: 'Project identifier', example: 'g-p-abc123' },
          title: { type: 'string', description: 'Full project title', example: 'My Project' },
          url: { type: 'string', format: 'uri', description: 'Direct URL to the project' },
          first_seen_at: { type: 'string', format: 'date-time', description: 'When first discovered' },
          last_confirmed_at: { type: 'string', format: 'date-time', description: 'When last confirmed' },
          pinned: { type: 'boolean', description: 'Whether marked for touch operations' },
          pinned_at: { type: 'string', format: 'date-time', nullable: true },
          icon_color: { type: 'string', nullable: true, description: 'Icon color hex' },
          icon_emoji: { type: 'string', nullable: true, description: 'Icon emoji name' },
        },
        required: ['id', 'title', 'first_seen_at', 'last_confirmed_at'],
      },
      TouchRequest: {
        type: 'object',
        description: 'A touch queue request',
        properties: {
          id: { type: 'integer', description: 'Request ID' },
          project_id: { type: 'string', description: 'ID of project to touch' },
          status: {
            type: 'string',
            enum: ['pending', 'processing', 'completed', 'failed'],
            description: 'Request status',
          },
          error_message: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
          processed_at: { type: 'string', format: 'date-time', nullable: true },
          created_by: { type: 'string', default: 'api' },
        },
        required: ['id', 'project_id', 'status', 'created_at'],
      },
      Meta: {
        type: 'object',
        description: 'Index metadata',
        properties: {
          name: { type: 'string', example: 'ChatGPT Project Index' },
          version: { type: 'string', example: '1.0.0' },
          project_count: { type: 'integer', example: 473 },
        },
        required: ['name', 'version', 'project_count'],
      },
    },
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'apikey',
        description: 'Supabase anon key',
      },
    },
  },
  security: [{ apiKey: [] }],
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(),
      },
    });
  }

  // Return OpenAPI spec as JSON
  return new Response(JSON.stringify(openApiSpec, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
    },
  });
});
