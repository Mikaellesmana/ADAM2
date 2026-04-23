import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../api";

export default function Result() {
  const { id } = useParams();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    async function fetchPeptide() {
      try {
        const res = await fetch(API_BASE + "/api/peptide/" + id);
        if (!res.ok) throw new Error("Failed to fetch peptide");
        const row = await res.json();
        setData(row);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPeptide();
  }, [id]);

  if (loading) {
    return (
      <div className="p-20 text-center text-lg">
        Loading peptide data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-20 text-red-500">
        Error: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-20">
        No peptide found.
      </div>
    );
  }

  var pubmedLink = null;
  if (data.Pubmed_ID) {
    pubmedLink = (
      <a
        href={"https://pubmed.ncbi.nlm.nih.gov/" + data.Pubmed_ID}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 hover:underline"
      >
        {data.Pubmed_ID}
      </a>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-10 py-16">

      <h1 className="text-3xl font-bold mb-10">
        {data.Peptide_Name || "N/A"}
      </h1>

      <section className="mb-10">
        <h2 className="text-xl font-bold mb-5">Peptide Identification</h2>
        <Info label="Peptide Name" value={data.Peptide_Name} />
        <Info label="Source"       value={data.Source} />
        <Info label="Taxonomy"     value={data.Tax} />
        <Info label="UniProt"      value={data.Uniprot} />
        <Info label="PDB"          value={data.PDB} />
        <Info label="Targets"      value={data.Targets} />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold mb-5">Sequence Information</h2>
        <Info label="Sequence"         value={data.Sequence} />
        <Info label="Sequence Length"  value={data.Sequence_Length} />
        <Info label="Swiss Prot Entry" value={data.Swiss_Prot_Entry} />
        <Info label="Family"           value={data.Family} />
        <Info label="Gene"             value={data.Gene} />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold mb-5">Biological Properties</h2>
        <Info label="Activity"              value={data.Activity} />
        <Info label="Protein Existence"     value={data.Protein_existence} />
        <Info label="Structure"             value={data.Structure} />
        <Info label="Structure Description" value={data.Structure_Description} />
        <Info label="Hemolytic Activity"    value={data.Hemolytic_activity} />
        <Info label="Cytotoxicity"          value={data.Cytotoxicity} />
        <Info label="Binding Target"        value={data.Binding_Target} />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold mb-5">Chemical Properties</h2>
        <Info label="Peptide Type"            value={data.Linear_Cyclic_Branched} />
        <Info label="N-terminal Modification" value={data.N_terminal_Modification} />
        <Info label="C-terminal Modification" value={data.C_terminal_Modification} />
        <Info label="Other Modifications"     value={data.Other_Modifications} />
        <Info label="Stereochemistry"         value={data.Stereochemistry} />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-bold mb-5">Comments</h2>
        <Info label="Comments" value={data.Comments} />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-5">Reference</h2>
        <Info label="PubMed ID"  value={pubmedLink} />
        <Info label="Author"     value={data.Author} />
        <Info label="Title"      value={data.Title} />
        <Info label="Reference"  value={data.Reference} />
        <Info label="Validation" value={data.Validation} />
      </section>

    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex border-b py-3">
      <div className="w-60 font-semibold text-teal-600">
        {label}
      </div>
      <div className="flex-1 break-words">
        {value != null ? value : "N/A"}
      </div>
    </div>
  );
}