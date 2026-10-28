import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Shown for addresses that don't exist, e.g. an old bookmark or a mistyped link. */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <div class="card">
      <div class="empty-state">
        <i class="bi bi-signpost-split"></i>
        <p class="fw-semibold text-body mb-1">Page not found</p>
        <p class="mb-3">
          There's nothing at <code>{{ path }}</code>. It may have moved, or the link may be mistyped.
        </p>
        <a class="btn btn-primary" [routerLink]="home">
          <i class="bi bi-house me-1"></i> Go to {{ homeLabel }}
        </a>
      </div>
    </div>
  `,
})
export class NotFoundPage {
  private readonly auth = inject(AuthService);
  protected readonly path = inject(Router).url;
  protected readonly home = this.auth.homeUrl();
  protected readonly homeLabel = this.home.includes('schedule') ? 'my schedule' : 'the dashboard';
}
