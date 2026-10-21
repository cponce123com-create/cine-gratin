import CataloguePage from "@/components/CataloguePage";

export default function SeriesList() {
  return (
    <CataloguePage
      title="Series"
      singular="serie"
      plural="series"
      endpoint="/api/series/catalogue"
      mediaType="series"
    />
  );
}
