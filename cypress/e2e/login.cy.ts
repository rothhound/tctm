describe('Login', () => {
  it('redirects unauthenticated visitors to /login', () => {
    cy.visit('/');
    cy.url().should('include', '/login');
  });

  it('shows the logo and the Google sign-in prompt', () => {
    cy.visit('/login');
    // TctmLogo renders an accessible SVG (aria-label="TCTM")
    cy.get('svg[aria-label="TCTM"]').should('be.visible');
    cy.contains('Sign in with your authorized Google account').should('be.visible');
  });

  it('renders the Google sign-in widget container', () => {
    cy.visit('/login');
    // @react-oauth/google mounts the button inside an iframe; assert the container exists.
    // (The actual Google OAuth popup is cross-origin and cannot be driven from Cypress.)
    cy.get('iframe', { timeout: 10000 }).should('exist');
  });

  it('redirects an already-authenticated user away from /login to /active', () => {
    // Inject a valid JWT (same keys authSlice reads) and stub the calls ActivePage makes.
    cy.login();
    cy.interceptApi();
    cy.visit('/login');
    cy.url().should('include', '/active');
  });

  it('keeps a logged-out visitor on /login', () => {
    cy.visit('/login');
    cy.url().should('include', '/login');
    cy.get('svg[aria-label="TCTM"]').should('be.visible');
  });
});
