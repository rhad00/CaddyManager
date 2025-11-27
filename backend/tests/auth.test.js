const request = require('supertest');
const { app } = require('../src/app');
const { User } = require('../src/models');
const bcrypt = require('bcrypt');

describe('Auth Endpoints', () => {
    let testUser;
    let agent;
    let csrfToken;

    beforeAll(async () => {
        // Ensure clean state - delete any existing test user
        await User.destroy({ where: { email: 'test@example.com' } });
        
        // Create a test user
        // Note: User model hook will hash the password
        testUser = await User.create({
            email: 'test@example.com',
            password_hash: 'Password123!',
            role: 'admin'
        });

        // Create agent to persist cookies
        agent = request.agent(app);
    });

    beforeEach(async () => {
        // Get CSRF token
        const res = await agent.get('/api/csrf-token');
        csrfToken = res.body.csrfToken;
    });

    afterAll(async () => {
        // Clean up test user
        if (testUser) {
            await User.destroy({ where: { id: testUser.id } });
        }
    });

    describe('POST /api/auth/login', () => {
        it('should login successfully with valid credentials', async () => {
            const res = await agent
                .post('/api/auth/login')
                .set('CSRF-Token', csrfToken)
                .send({
                    email: 'test@example.com',
                    password: 'Password123!'
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user).toHaveProperty('email', 'test@example.com');
        });

        it('should fail with invalid credentials', async () => {
            const res = await agent
                .post('/api/auth/login')
                .set('CSRF-Token', csrfToken)
                .send({
                    email: 'test@example.com',
                    password: 'WrongPassword'
                });

            expect(res.statusCode).toEqual(401);
            expect(res.body.success).toBe(false);
        });

        it('should fail with invalid email format', async () => {
            const res = await agent
                .post('/api/auth/login')
                .set('CSRF-Token', csrfToken)
                .send({
                    email: 'invalid-email',
                    password: 'Password123!'
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toBe('Validation error');
        });

        // Note: Rate limiting test might be tricky if it shares state across tests
        // We might need to mock rate limiter or run it in isolation
        // For now, we skip explicit rate limit test in this suite to avoid blocking other tests
    });
});
