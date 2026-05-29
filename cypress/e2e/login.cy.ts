describe('Login', () => {
  it('shows login page when not authenticated', () => {
    cy.visit('/');
    cy.url().should('include', '/login');
    cy.contains('h1', 'Assistant').should('be.visible');
    cy.get('input[type="password"]').should('be.visible');
  });

  it('sign in button is disabled when password is empty', () => {
    cy.visit('/login');
    cy.contains('button', 'Sign in').should('be.disabled');
  });

  it('enables sign in button when password is typed', () => {
    cy.visit('/login');
    cy.contains('button', 'Sign in').should('be.disabled');
    cy.get('input[type="password"]').type('my-secret');
    cy.contains('button', 'Sign in').should('not.be.disabled');
  });

  it('redirects to /active after successful login', () => {
    cy.intercept('POST', '/api/auth/login', {
      statusCode: 200,
      body: { token: 'test-token', expiresAt: new Date(Date.now() + 86400000).toISOString() },
    }).as('login');

    // Intercept the API calls that ActivePage will make after redirect
    cy.intercept('GET', '/api/tasks?*', {
      body: { data: [], total: 0, page: 1, limit: 25, hasMore: false },
    });
    cy.intercept('GET', '/api/tasks/counts', {
      body: { pending: 0, done: 0, total: 0 },
    });

    cy.visit('/login');
    cy.get('input[type="password"]').type('correct-password');
    cy.contains('button', 'Sign in').click();
    cy.wait('@login');
    cy.url().should('include', '/active');
  });

  it('shows error on wrong password', () => {
    cy.intercept('POST', '/api/auth/login', {
      statusCode: 403,
      body: { message: 'Invalid password' },
    });

    cy.visit('/login');
    cy.get('input[type="password"]').type('wrong-password');
    cy.contains('button', 'Sign in').click();
    cy.contains('Invalid password').should('be.visible');
  });
});
