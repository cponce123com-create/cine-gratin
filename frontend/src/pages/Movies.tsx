import CataloguePage from "@/components/CataloguePage";

export default function Movies() {
  return (
    <CataloguePage
      title="Películas"
      singular="película"
      plural="películas"
      endpoint="/api/movies/catalogue"
      mediaType="movie"
    />
  );
}
