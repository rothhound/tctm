describe('Done', () => {
  beforeEach(() => {
    cy.login();
    cy.interceptApi();
    cy.fixture('tasks').then((tasks) => {
      // Completed, non-archived, non-reported tasks live on the Done page.
      cy.intercept('GET', '/api/tasks/done', {
        body: tasks.filter((t: any) => t.status === 'done' && !t.archived && !t.reported),
      }).as('getDone');
    });
    cy.visit('/done');
  });

  it('displays Done heading with count', () => {
    cy.get('h1').should('contain.text', 'Done (1)');
  });

  it('shows completed task title', () => {
    cy.contains('Prepare board deck').should('be.visible');
  });

  it('shows a "Reopen" button on each card', () => {
    cy.contains('button', 'Reopen').should('be.visible');
  });

  it('clicking Reopen calls the uncomplete API', () => {
    cy.intercept('POST', '/api/tasks/task-003/uncomplete', {
      statusCode: 200,
      body: {},
    }).as('uncompleteTask');

    cy.contains('button', 'Reopen').click();
    cy.wait('@uncompleteTask');
  });

  it('shows empty state when no completed tasks', () => {
    cy.intercept('GET', '/api/tasks/done', { body: [] }).as('getDoneEmpty');
    cy.visit('/done');
    cy.contains('No completed tasks').should('be.visible');
  });
});
