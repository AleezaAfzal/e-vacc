import { Link } from 'react-router-dom'
import VaccineCatalog from './VaccineCatalog'
import VaccineStockCard from './VaccineStockCard'

export default function AdminHome() {
  return (
    <div className="stack gap-lg">
      <div className="row spread">
        <div>
          <h1>Admin</h1>
          <p className="muted">Catalog vaccines, monitor national stock, vet centre requests.</p>
        </div>
        <div className="row gap wrap">
          <Link className="btn ghost" to="/admin/requests">
            Centre approvals
          </Link>
          <Link className="btn ghost" to="/admin/allocate-doses">
            Allocate doses
          </Link>
          <Link className="btn ghost" to="/admin/dose-requests">
            Dose requests
          </Link>
        </div>
      </div>
      <VaccineCatalog />
      <VaccineStockCard />
    </div>
  )
}
