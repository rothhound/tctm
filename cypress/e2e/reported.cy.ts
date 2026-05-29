describe('Reported', () => {
  beforeEach(() => {
    cy.login();
    cy.interceptApi();
    cy.fixture('tasks').then((tasks) => {
      cy.intercept('GET', '/api/tasks/reported', {
        body: tasks.filter((t: any) => t.reported),
      }).as('getReported');
    });
    cy.visit('/reported');
  });

  it('displays reported heading with count', () => {
    cy.get('h1').should('contain.text', 'Reported (1)');
  });

  it('shows reported task title', () => {
    cy.contains('Bad extraction — newsletter summary').should('be.visible');
  });

  it('shows report reason badge', () => {
    cy.contains('Not a task').should('be.visible');
  });

  it('shows "Restore" button', () => {
    cy.contains('button', 'Restore').should('be.visible');
  });

  it('clicking Restore calls unreport API', () => {
    cy.intercept('POST', '/api/tasks/task-006/unreport', {
      statusCode: 200,
      body: {},
    }).as('unreportTask');

    cy.contains('button', 'Restore').click();
    cy.wait('@unreportTask');
  });

  it('shows empty state when no reported tasks', () => {
    cy.intercept('GET', '/api/tasks/reported', { body: [] }).as('getReportedEmpty');
    cy.visit('/reported');
    cy.contains('No issues reported').should('be.visible');
  });
});
