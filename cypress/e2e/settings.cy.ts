describe('Settings', () => {
  beforeEach(() => {
    cy.login();
    cy.interceptApi();
  });

  it('displays settings menu with all links', () => {
    cy.visit('/settings');
    cy.contains('h1', 'Settings').should('be.visible');
    cy.contains('Contacts & Entities').should('be.visible');
    cy.contains('Source Thresholds').should('be.visible');
    cy.contains('Prompt Versions').should('be.visible');
    cy.contains('Metrics').should('be.visible');
    cy.contains('Audit Log').should('be.visible');
    cy.contains('Sign out').should('be.visible');
  });

  it('navigates to Contacts & Entities', () => {
    cy.visit('/settings');
    cy.contains('Contacts & Entities').click();
    cy.url().should('include', '/settings/entities');
  });

  it('navigates to Source Thresholds', () => {
    cy.visit('/settings');
    cy.contains('Source Thresholds').click();
    cy.url().should('include', '/settings/thresholds');
  });

  it('navigates to Prompt Versions', () => {
    cy.visit('/settings');
    cy.contains('Prompt Versions').click();
    cy.url().should('include', '/settings/prompts');
  });

  it('navigates to Metrics page and shows "Last 30 days"', () => {
    cy.visit('/settings');
    cy.contains('Metrics').click();
    cy.url().should('include', '/settings/metrics');
    cy.contains('Last 30 days').should('be.visible');
  });

  it('navigates to Audit Log page', () => {
    cy.visit('/settings');
    cy.contains('Audit Log').click();
    cy.url().should('include', '/settings/audit');
    cy.contains('h1', 'Audit Log').should('be.visible');
  });

  it('sign out clears auth and redirects to login', () => {
    cy.visit('/settings');
    cy.contains('Sign out').click();
    cy.url().should('include', '/login');
    // Verify auth was cleared — visiting a protected page should redirect
    cy.visit('/active');
    cy.url().should('include', '/login');
  });
});
